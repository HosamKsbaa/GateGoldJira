// Package app owns concrete wiring and feature registration for both transports.
package app

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/features/boards"
	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/integrations"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/mcptokens"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/features/planning"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/danielgtaylor/huma/v2"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type Application struct {
	Handler            http.Handler
	API                huma.API
	MCP                *mcp.Server
	Runner             command.Runner
	Storage            objectstore.Store
	Cursors            *command.CursorSigner
	Sessions           auth.Sessions
	Database           *database.Database
	closeStorage       func() error
	NotificationWorker *notifications.Worker
	backgroundCancel   context.CancelFunc
	backgroundGroup    sync.WaitGroup
	backgroundOnce     sync.Once
	environment        config.Environment
	workerInterval     time.Duration
	companyLocation    *time.Location
	logger             *slog.Logger
	vmMaintenance      func(context.Context) error
}

func New(ctx context.Context, settings config.Config, logger *slog.Logger) (*Application, error) {
	db, err := database.Open(ctx, settings)
	if err != nil {
		return nil, errors.New("database initialization failed; apply migrations and check local settings")
	}
	application := &Application{
		Database:        db,
		Runner:          command.Runner{Pool: db.Pool},
		environment:     settings.Environment,
		workerInterval:  settings.NotificationWorkerInterval,
		companyLocation: settings.CompanyLocation,
		logger:          logger,
	}
	complete := false
	defer func() {
		if !complete {
			application.Close()
		}
	}()
	verifier, err := auth.New(settings)
	if err != nil {
		return nil, err
	}
	application.Cursors, err = command.NewCursorSigner(settings.CursorSecret)
	if err != nil {
		return nil, err
	}
	if settings.StorageMode == config.LocalStorage {
		application.Storage, err = objectstore.NewLocal(settings.LocalPictureDirectory)
	} else {
		var google *objectstore.Google
		google, err = objectstore.NewGoogle(ctx, settings.StagingBucket, settings.PublishedBucket)
		if err == nil {
			application.Storage = google
			application.closeStorage = google.Close
		}
	}
	if err != nil {
		return nil, errors.New("private picture storage initialization failed")
	}
	application.Runner.WriteGuard = boards.GuardWIP
	identityService := identity.New(application.Runner, application.Cursors, settings.CompanyLocation, settings.Issuer)
	tokenService := mcptokens.New(application.Runner, settings.MCPAudience)
	if settings.MCPBrowserOAuthEnabled || settings.Environment == config.Development && settings.AuthMode == config.DevelopmentAuth {
		if err := tokenService.WithBrowserOAuth(settings); err != nil {
			return nil, err
		}
	}
	projectService := projects.New(application.Runner, application.Cursors)
	issueService := issues.New(application.Runner, application.Cursors)
	boardService := boards.New(application.Runner, application.Cursors, issues.Summary)
	boardService.WithModernSummaries(issues.ModernSummaries)
	boardService.WithNativeMover(issueService.MoveStageForBoard)
	issueService.WithBoards(boardService.Access())
	issueService.WithStageRule(integrations.ApplyStageRule)
	boardService.WithStageMover(issueService.RetireStage)
	configurationService := configuration.New(application.Runner, application.Cursors).WithStageMigrator(issueService.MigrateWorkflowStage).WithFieldBackfiller(issueService.BackfillFieldDefault)
	attachmentService := attachments.New(application.Runner, application.Cursors, application.Storage).WithMaximumBytes(settings.MaximumAttachmentBytes)
	if settings.Environment == config.Production && settings.DeploymentTarget == config.VM {
		application.vmMaintenance = func(ctx context.Context) error {
			_, err := attachmentService.MaintainAssets(ctx)
			return err
		}
	}
	pictureService := pictures.New(application.Runner, application.Cursors, application.Storage).WithAssets(attachmentService)
	issueService.WithAssets(attachmentService)
	commentService := comments.New(application.Runner, application.Cursors, pictureService)
	notificationService := notifications.New(application.Runner, application.Cursors)
	var sender notifications.Sender
	if settings.SMTPAddress != "" {
		configured, err := notifications.NewSMTPSender(notifications.SMTPConfig{
			Address:             settings.SMTPAddress,
			From:                settings.SMTPFrom,
			Username:            settings.SMTPUsername,
			Password:            settings.SMTPPassword,
			AllowLocalPlaintext: settings.SMTPAllowLocalPlaintext,
		})
		if err != nil {
			return nil, errors.New("notification email configuration is invalid")
		}
		sender = configured
	}
	frontendURL := settings.NotificationAppURL
	if frontendURL == "" && len(settings.AllowedOrigins) > 0 {
		frontendURL = settings.AllowedOrigins[0]
	}
	application.NotificationWorker, err = notifications.NewWorker(db.Pool, sender, frontendURL)
	if err != nil {
		return nil, err
	}
	notificationService.SetEmailDeliveryAvailable(sender != nil)
	application.Sessions = auth.Sessions{
		Verifier: verifier,
		Location: settings.CompanyLocation,
		Resolve:  identityService.Resolve,
		MCPToken: tokenService.Authenticate,
		MCPOAuth: tokenService.AuthenticateOAuth,
	}
	apiMux := http.NewServeMux()
	application.API = httpapi.New(apiMux)
	mcptokens.RegisterHTTP(application.API, tokenService)
	application.MCP = mcpapi.New()
	if err := register(application.API, application.MCP, identityService, projectService, issueService, boardService, activity.New(application.Runner, application.Cursors), pictureService, attachmentService, commentService, notificationService, planning.New(application.Runner, application.Cursors), integrations.New(application.Runner, application.Cursors), configurationService); err != nil {
		return nil, err
	}
	root := http.NewServeMux()
	if settings.Environment == config.Development && settings.AuthMode == config.DevelopmentAuth {
		login, err := auth.NewLocalLogin(settings, identityService.Resolve)
		if err != nil {
			return nil, err
		}
		httpapi.RegisterLocalLogin(application.API, login)
		root.Handle("POST "+httpapi.LocalLoginPath, httpapi.LocalLoginHandler(apiMux))
	}
	if settings.AuthMode == config.PasswordAuth {
		login, err := auth.NewPasswordLogin(settings, identityService.Resolve)
		if err != nil {
			return nil, err
		}
		httpapi.RegisterPasswordLogin(application.API, login)
		root.Handle("POST "+httpapi.PasswordLoginPath, httpapi.LocalLoginHandler(apiMux))
	}
	httpapi.PublicRoutes(root, db.Pool.Ping)
	mcpapi.Metadata(root, settings, tokenService.OAuthIssuer(settings.Issuer))
	tokenService.RegisterBrowserOAuth(root)
	gate := objectstore.NewTransferGate()
	root.Handle("/mcp", mcpapi.Handler(application.MCP, application.Sessions, settings, gate, tokenService))
	root.Handle("/api/", httpapi.Authenticated(application.Sessions, command.REST, "", httpapi.FeatureLimits(gate, apiMux)))
	httpapi.RegisterMaintenance(root, settings.MaintenanceAudience, settings.MaintenanceEmails, func(ctx context.Context) (maintenanceResult, error) {
		// The protected request has a 30-second budget. Leave ten seconds for
		// private file cleanup; unfinished delivery rows remain durable.
		notificationContext, cancel := context.WithTimeout(ctx, 20*time.Second)
		notificationCount, err := application.NotificationWorker.RunOnce(notificationContext, command.Today(time.Now(), settings.CompanyLocation))
		budgetReached := errors.Is(notificationContext.Err(), context.DeadlineExceeded)
		cancel()
		if ctx.Err() != nil {
			return maintenanceResult{}, ctx.Err()
		}
		if err != nil && !budgetReached {
			return maintenanceResult{}, err
		}
		asset, err := attachmentService.MaintainAssets(ctx)
		if err != nil {
			return maintenanceResult{}, err
		}
		return maintenanceResult{
			MaintenanceResult: pictures.MaintenanceResult{
				Paused:         asset.Paused,
				ExpiredDrafts:  asset.ExpiredDrafts,
				RemovedStaging: asset.RemovedStaging,
				RemovedRetries: asset.RemovedRetries,
			},
			AttachmentRemovedStaging:        0,
			NotificationDeliveriesProcessed: notificationCount,
		}, nil
	})
	openAPI := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(application.API.OpenAPI())
	})
	// Documentation contains no credentials, but production discovery still
	// requires the same verified active company session as ordinary API reads.
	if settings.Environment == config.Production {
		root.Handle("GET /openapi.json", httpapi.Authenticated(application.Sessions, command.REST, "", openAPI))
	} else {
		root.Handle("GET /openapi.json", openAPI)
	}
	application.Handler = httpapi.RequestLog(logger, httpapi.CORS(settings.AllowedOrigins, root))
	complete = true
	return application, nil
}

func register(api huma.API, server *mcp.Server, identityService *identity.Service, projectService *projects.Service, issueService *issues.Service, boardService *boards.Service, activityService *activity.Service, pictureService *pictures.Service, attachmentService *attachments.Service, commentService *comments.Service, notificationService *notifications.Service, planningService *planning.Service, integrationService *integrations.Service, configurationService *configuration.Service) error {
	configuration.RegisterHTTP(api, configurationService)
	if err := configuration.RegisterMCP(server, configurationService); err != nil {
		return err
	}
	integrations.RegisterHTTP(api, integrationService)
	planning.RegisterHTTP(api, planningService)
	identity.RegisterHTTP(api, identityService)
	projects.RegisterHTTP(api, projectService)
	issues.RegisterHTTP(api, issueService)
	boards.RegisterHTTP(api, boardService)
	activity.RegisterHTTP(api, activityService)
	pictures.RegisterHTTP(api, pictureService)
	attachments.RegisterHTTP(api, attachmentService)
	comments.RegisterHTTP(api, commentService)
	notifications.RegisterHTTP(api, notificationService)
	if err := identity.RegisterMCP(server, identityService); err != nil {
		return err
	}
	if err := projects.RegisterMCP(server, projectService); err != nil {
		return err
	}
	if err := issues.RegisterMCP(server, issueService); err != nil {
		return err
	}
	if err := boards.RegisterMCP(server, boardService); err != nil {
		return err
	}
	if err := activity.RegisterMCP(server, activityService); err != nil {
		return err
	}
	if err := pictures.RegisterMCP(server, pictureService); err != nil {
		return err
	}
	if err := attachments.RegisterMCP(server, attachmentService); err != nil {
		return err
	}
	if err := comments.RegisterMCP(server, commentService); err != nil {
		return err
	}
	if err := planning.RegisterMCP(server, planningService); err != nil {
		return err
	}
	if err := integrations.RegisterMCP(server, integrationService); err != nil {
		return err
	}
	return notifications.RegisterMCP(server, notificationService)
}

// Export registration uses the same DTOs/adapters as runtime without opening
// databases, starting a server, reading secrets or executing a handler.
func contractAdapters() (huma.API, *mcp.Server, error) {
	api := httpapi.New(http.NewServeMux())
	mcptokens.RegisterHTTP(api, mcptokens.New(command.Runner{}, "https://api.example.com/mcp"))
	httpapi.RegisterLocalLogin(api, nil)
	httpapi.RegisterPasswordLogin(api, nil)
	server := mcpapi.New()
	service := identity.New(command.Runner{}, nil, time.UTC, "")
	err := register(api, server, service, projects.New(command.Runner{}, nil), issues.New(command.Runner{}, nil), boards.New(command.Runner{}, nil, issues.Summary), activity.New(command.Runner{}, nil), pictures.New(command.Runner{}, nil, nil), attachments.New(command.Runner{}, nil, nil), comments.New(command.Runner{}, nil, nil), notifications.New(command.Runner{}, nil), planning.New(command.Runner{}, nil), integrations.New(command.Runner{}, nil), configuration.New(command.Runner{}, nil))
	return api, server, err
}
func Contracts() (huma.API, error)       { api, _, err := contractAdapters(); return api, err }
func MCPContracts() (*mcp.Server, error) { _, server, err := contractAdapters(); return server, err }

func (application *Application) Close() {
	if application.backgroundCancel != nil {
		application.backgroundCancel()
	}
	application.backgroundGroup.Wait()
	if application.closeStorage != nil {
		_ = application.closeStorage()
	}
	if application.Database != nil {
		application.Database.Close()
	}
}

type maintenanceResult struct {
	pictures.MaintenanceResult
	AttachmentRemovedStaging        int32 `json:"attachmentRemovedStaging"`
	NotificationDeliveriesProcessed int   `json:"notificationDeliveriesProcessed"`
}

// StartBackground uses the server's lifetime context, never New's startup
// timeout. Production runs work through authenticated scheduled maintenance;
// test runtimes remain deterministic and use explicit job calls.
func (application *Application) StartBackground(parent context.Context) {
	if application.environment != config.Development && application.vmMaintenance == nil || application.NotificationWorker == nil {
		return
	}
	application.backgroundOnce.Do(func() {
		ctx, cancel := context.WithCancel(parent)
		application.backgroundCancel = cancel
		interval := application.workerInterval
		if interval == 0 {
			interval = time.Minute
		}
		application.backgroundGroup.Add(1)
		go func() {
			defer application.backgroundGroup.Done()
			ticker := time.NewTicker(interval)
			defer ticker.Stop()
			for {
				work, cancel := context.WithTimeout(ctx, 30*time.Second)
				_, err := application.NotificationWorker.RunOnce(work, command.Today(time.Now(), application.companyLocation))
				if err != nil && ctx.Err() == nil {
					application.logger.Warn("notification maintenance will retry on the next interval")
				}
				if application.vmMaintenance != nil {
					if err := application.vmMaintenance(work); err != nil && ctx.Err() == nil {
						application.logger.Warn("private file maintenance will retry on the next interval")
					}
				}
				cancel()
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
				}
			}
		}()
	})
}
