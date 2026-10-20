package mcptokens

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/database/dbgen"
	oauth "github.com/go-oauth2/oauth2/v4"
	"github.com/google/uuid"
	"golang.org/x/time/rate"
)

// BrowserOAuth exchanges browser-approved identities for MCP-only credentials.
// Shared servers use their verified OIDC web identities; password fixtures stay local.
type BrowserOAuth struct {
	service  *Service
	Issuer   string
	frontend string
	limiter  *rate.Limiter
}

func (service *Service) WithBrowserOAuth(settings config.Config) error {
	localLogin := settings.Environment == config.Development && settings.AuthMode == config.DevelopmentAuth
	if localLogin {
		if err := auth.ValidateLocalLoginSettings(settings); err != nil {
			return err
		}
	} else {
		if !settings.MCPBrowserOAuthEnabled || settings.AuthMode != config.OIDC && settings.AuthMode != config.PasswordAuth {
			return errors.New("shared browser OAuth requires explicit enablement and verified browser identities")
		}
		if settings.AuthMode == config.PasswordAuth {
			if err := auth.ValidatePasswordLoginSettings(settings); err != nil {
				return err
			}
		}
	}
	frontend := settings.NotificationAppURL
	if frontend == "" && len(settings.AllowedOrigins) > 0 {
		frontend = settings.AllowedOrigins[0]
	}
	if frontend == "" {
		return errors.New("browser OAuth requires the browser app origin")
	}
	for _, address := range []string{frontend, settings.MCPAudience} {
		parsed, err := url.Parse(address)
		if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
			return errors.New("browser OAuth requires canonical service and browser URLs")
		}
		loopback := parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1"
		if localLogin && !loopback || !localLogin && parsed.Scheme != "https" {
			return errors.New("shared browser OAuth requires HTTPS; local password login stays on loopback")
		}
	}
	issuer := strings.TrimSuffix(settings.MCPAudience, "/mcp") + "/oauth"
	service.oauth = &BrowserOAuth{service: service, Issuer: issuer, frontend: strings.TrimRight(frontend, "/"), limiter: rate.NewLimiter(10, 30)}
	return nil
}
func (service *Service) OAuthIssuer(fallback string) string {
	if service.oauth != nil {
		return service.oauth.Issuer
	}
	return fallback
}

func validOAuthRedirect(text string) bool {
	if text == "https://antigravity.google/oauth-callback" {
		return true
	}
	parsed, err := url.Parse(text)
	return err == nil && parsed.Scheme == "http" && (parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1") && parsed.Port() != "" && parsed.User == nil && parsed.RawQuery == "" && parsed.Fragment == "" && (parsed.Path == "/oauth/callback" || parsed.Path == "/callback")
}

var pkceChallenge = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
var pkceVerifier = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)

func oauthError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Error string `json:"error"`
	}{code})
}
func (service *Service) RegisterBrowserOAuth(mux *http.ServeMux) {
	local := service.oauth
	if local == nil {
		return
	}
	metadata := func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(struct {
			Issuer         string   `json:"issuer"`
			Authorization  string   `json:"authorization_endpoint"`
			Token          string   `json:"token_endpoint"`
			Revocation     string   `json:"revocation_endpoint"`
			ResponseTypes  []string `json:"response_types_supported"`
			GrantTypes     []string `json:"grant_types_supported"`
			AuthMethods    []string `json:"token_endpoint_auth_methods_supported"`
			Challenges     []string `json:"code_challenge_methods_supported"`
			Scopes         []string `json:"scopes_supported"`
			IssuerResponse bool     `json:"authorization_response_iss_parameter_supported"`
		}{local.Issuer, local.Issuer + "/authorize", local.Issuer + "/token", local.Issuer + "/revoke", []string{"code"}, []string{"authorization_code", "refresh_token"}, []string{"none"}, []string{"S256"}, []string{oauthScope}, true})
	}
	mux.HandleFunc("GET /.well-known/oauth-authorization-server/oauth", metadata)
	mux.HandleFunc("GET /.well-known/oauth-authorization-server/oauth/", metadata)
	mux.HandleFunc("GET /oauth/.well-known/oauth-authorization-server", metadata)
	mux.HandleFunc("GET /oauth/authorize", local.authorize)
	mux.HandleFunc("POST /oauth/token", local.token)
	mux.HandleFunc("POST /oauth/revoke", local.revoke)
}
func one(values url.Values, key string) string {
	if len(values[key]) != 1 {
		return ""
	}
	return values.Get(key)
}
func (local *BrowserOAuth) authorize(w http.ResponseWriter, r *http.Request) {
	if !local.limiter.Allow() {
		oauthError(w, 429, "temporarily_unavailable")
		return
	}
	if len(r.URL.RawQuery) > 8192 {
		oauthError(w, 400, "invalid_request")
		return
	}
	query, err := url.ParseQuery(r.URL.RawQuery)
	challenge, state, redirect := one(query, "code_challenge"), one(query, "state"), one(query, "redirect_uri")
	decoded, decodeErr := base64.RawURLEncoding.Strict().DecodeString(challenge)
	if err != nil || one(query, "client_id") != OAuthClientID || one(query, "response_type") != "code" || one(query, "scope") != oauthScope || one(query, "resource") != local.service.endpoint || one(query, "code_challenge_method") != "S256" || !pkceChallenge.MatchString(challenge) || decodeErr != nil || len(decoded) != 32 || state == "" || len(state) > 1024 || !validOAuthRedirect(redirect) {
		oauthError(w, 400, "invalid_request")
		return
	}
	request, err := randomCredential("")
	if err != nil {
		oauthError(w, 503, "temporarily_unavailable")
		return
	}
	ctx, cancel := command.OrdinaryContext(r.Context())
	defer cancel()
	err = dbgen.New(local.service.runner.Pool).OAuthAuthorizationCreate(ctx, dbgen.OAuthAuthorizationCreateParams{RequestHash: credentialHash(request), ClientID: OAuthClientID, RedirectUri: redirect, State: state, Challenge: challenge})
	if err != nil {
		oauthError(w, 503, "temporarily_unavailable")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, local.frontend+"/account/mcp-authorize?request="+url.QueryEscape(request), http.StatusFound)
}

type OAuthConsent struct {
	ClientName  string `json:"clientName"`
	RedirectURI string `json:"redirectUri"`
	Scope       string `json:"scope"`
}
type OAuthDecision struct {
	Allow bool `json:"allow"`
}
type OAuthRedirect struct {
	RedirectURL string `json:"redirectUrl"`
}

func (service *Service) Consent(ctx context.Context, actor command.Actor, request string) (OAuthConsent, error) {
	if err := requireBrowser(actor); err != nil {
		return OAuthConsent{}, err
	}
	if service.oauth == nil {
		return OAuthConsent{}, failure(command.Unavailable, "Browser authorization is unavailable.")
	}
	return command.Read(ctx, service.runner, actor, command.Access{}, func(ctx context.Context, mutation *command.Mutation) (OAuthConsent, error) {
		row, err := mutation.Queries.OAuthAuthorizationRead(ctx, credentialHash(request))
		if err != nil {
			return OAuthConsent{}, failure(command.Unavailable, "This connection request has expired or was already completed. Start again from Antigravity.")
		}
		return OAuthConsent{ClientName: "Antigravity", RedirectURI: row.RedirectUri, Scope: oauthScope}, nil
	})
}
func (service *Service) Decide(ctx context.Context, actor command.Actor, request string, allow bool) (OAuthRedirect, error) {
	if err := requireBrowser(actor); err != nil {
		return OAuthRedirect{}, err
	}
	if service.oauth == nil {
		return OAuthRedirect{}, failure(command.Unavailable, "Browser authorization is unavailable.")
	}
	return command.AccountChange(ctx, service.runner, actor, func(ctx context.Context, mutation *command.Mutation) (OAuthRedirect, error) {
		row, err := mutation.Queries.OAuthAuthorizationLock(ctx, credentialHash(request))
		if err != nil {
			return OAuthRedirect{}, failure(command.Unavailable, "This connection request has expired or was already completed. Start again from Antigravity.")
		}
		values := url.Values{"state": {row.State}, "iss": {service.oauth.Issuer}}
		if !allow {
			values.Set("error", "access_denied")
		} else {
			if _, err := mutation.Queries.MCPTokenOwnerGuard(ctx, actor.UserID.UUID); err != nil {
				return OAuthRedirect{}, err
			}
			count, err := mutation.Queries.MCPTokenActiveCount(ctx, actor.UserID.UUID)
			if err != nil {
				return OAuthRedirect{}, err
			}
			if count >= ActiveLimit {
				return OAuthRedirect{}, failure(command.Validation, "Revoke an unused MCP connection before connecting another client.")
			}
			unused := make([]byte, 32)
			if _, err := rand.Read(unused); err != nil {
				return OAuthRedirect{}, err
			}
			connection, err := mutation.Queries.OAuthConnectionCreate(ctx, dbgen.OAuthConnectionCreateParams{ID: uuid.New(), UserID: actor.UserID.UUID, TokenHash: unused})
			if err != nil {
				return OAuthRedirect{}, err
			}
			token, err := newOAuthManager(mutation.Queries, row.ClientID).GenerateAuthToken(ctx, oauth.Code, &oauth.TokenGenerateRequest{ClientID: row.ClientID, UserID: connection.String(), RedirectURI: row.RedirectUri, Scope: oauthScope, CodeChallenge: row.Challenge, CodeChallengeMethod: oauth.CodeChallengeS256})
			if err != nil {
				return OAuthRedirect{}, err
			}
			values.Set("code", token.GetCode())
		}
		if err := mutation.Queries.OAuthAuthorizationConsume(ctx, credentialHash(request)); err != nil {
			return OAuthRedirect{}, err
		}
		return OAuthRedirect{RedirectURL: row.RedirectUri + "?" + values.Encode()}, nil
	})
}

func (local *BrowserOAuth) token(w http.ResponseWriter, r *http.Request) {
	if !local.limiter.Allow() {
		oauthError(w, 429, "temporarily_unavailable")
		return
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") || r.URL.RawQuery != "" {
		oauthError(w, 400, "invalid_request")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	if r.ParseForm() != nil {
		oauthError(w, 400, "invalid_request")
		return
	}
	form := r.PostForm
	client := one(form, "client_id")
	if r.Header.Get("Authorization") != "" || client != OAuthClientID || form.Get("client_secret") != "" {
		oauthError(w, 401, "invalid_client")
		return
	}
	if one(form, "resource") != local.service.endpoint {
		oauthError(w, 400, "invalid_target")
		return
	}
	grant := oauth.GrantType(one(form, "grant_type"))
	if grant != oauth.AuthorizationCode && grant != oauth.Refreshing {
		oauthError(w, 400, "unsupported_grant_type")
		return
	}
	request := &oauth.TokenGenerateRequest{ClientID: client, Request: r}
	if grant == oauth.AuthorizationCode {
		request.Code = one(form, "code")
		request.CodeVerifier = one(form, "code_verifier")
		request.RedirectURI = one(form, "redirect_uri")
		if !pkceVerifier.MatchString(request.CodeVerifier) || !pkceChallenge.MatchString(request.Code) || !validOAuthRedirect(request.RedirectURI) {
			oauthError(w, 400, "invalid_grant")
			return
		}
	} else {
		request.Refresh = one(form, "refresh_token")
		if !strings.HasPrefix(request.Refresh, "gg_refresh_") || len(request.Refresh) != 54 {
			oauthError(w, 400, "invalid_grant")
			return
		}
		if len(form["scope"]) > 1 || form.Get("scope") != "" && form.Get("scope") != oauthScope {
			oauthError(w, 400, "invalid_scope")
			return
		}
	}
	ctx, cancel := command.OrdinaryContext(r.Context())
	defer cancel()
	tx, err := local.service.runner.Pool.Begin(ctx)
	if err != nil {
		oauthError(w, 503, "temporarily_unavailable")
		return
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	manager := newOAuthManager(dbgen.New(tx), client)
	var info oauth.TokenInfo
	if grant == oauth.AuthorizationCode {
		info, err = manager.GenerateAccessToken(ctx, grant, request)
	} else {
		info, err = manager.RefreshAccessToken(ctx, request)
	}
	if err != nil {
		_ = tx.Rollback(ctx)
		if errors.Is(err, errRefreshReplay) {
			_ = dbgen.New(local.service.runner.Pool).OAuthReplayRevoke(ctx, credentialHash(request.Refresh))
		}
		oauthError(w, 400, "invalid_grant")
		return
	}
	if err = tx.Commit(ctx); err != nil {
		oauthError(w, 503, "temporarily_unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	_ = json.NewEncoder(w).Encode(struct {
		Access  string `json:"access_token"`
		Type    string `json:"token_type"`
		Expires int64  `json:"expires_in"`
		Refresh string `json:"refresh_token"`
		Scope   string `json:"scope"`
	}{info.GetAccess(), "Bearer", int64(info.GetAccessExpiresIn().Seconds()), info.GetRefresh(), info.GetScope()})
}
func (service *Service) AuthenticateOAuth(ctx context.Context, token string) (auth.PersonalMCPIdentity, error) {
	if service.oauth == nil || !strings.HasPrefix(token, OAuthAccessPrefix) || len(token) != len(OAuthAccessPrefix)+43 {
		return auth.PersonalMCPIdentity{}, errors.New("invalid OAuth access credential")
	}
	row, err := dbgen.New(service.runner.Pool).OAuthAccessAuthenticate(ctx, credentialHash(token))
	if err != nil {
		return auth.PersonalMCPIdentity{}, errors.New("invalid OAuth access credential")
	}
	return auth.PersonalMCPIdentity{UserID: command.UserID{UUID: row.UserID}, TokenID: row.ID}, nil
}

// RFC 7009: a credential can revoke only its own connection. Unknown credentials
// receive the same successful response, without exposing account information.
func (local *BrowserOAuth) revoke(w http.ResponseWriter, r *http.Request) {
	if !local.limiter.Allow() {
		oauthError(w, 429, "temporarily_unavailable")
		return
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") || r.URL.RawQuery != "" {
		oauthError(w, 400, "invalid_request")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	if r.ParseForm() != nil {
		oauthError(w, 400, "invalid_request")
		return
	}
	if r.Header.Get("Authorization") != "" || one(r.PostForm, "client_id") != OAuthClientID || r.PostForm.Get("client_secret") != "" {
		oauthError(w, 401, "invalid_client")
		return
	}
	token := one(r.PostForm, "token")
	if token == "" || len(token) > 1024 {
		oauthError(w, 400, "invalid_request")
		return
	}
	ctx, cancel := command.OrdinaryContext(r.Context())
	defer cancel()
	if err := dbgen.New(local.service.runner.Pool).OAuthCredentialRevoke(ctx, credentialHash(token)); err != nil {
		oauthError(w, 503, "temporarily_unavailable")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
}
