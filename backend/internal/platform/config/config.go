// Package config validates settings once without logging secret values.
package config

import (
	"errors"
	"net"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Environment string

const (
	Development Environment = "development"
	Test        Environment = "test"
	Production  Environment = "production"
)

type AuthMode string

const (
	DevelopmentAuth AuthMode = "development"
	OIDC            AuthMode = "oidc"
)

type StorageMode string

const (
	LocalStorage StorageMode = "local"
	GCS          StorageMode = "gcs"
)

type Config struct {
	Environment                Environment
	Port                       uint16
	DatabaseURL                string
	CloudSQLInstance           string
	CompanyLocation            *time.Location
	AuthMode                   AuthMode
	Issuer                     string
	RESTAudience               string
	MCPAudience                string
	RequiredScope              string
	MCPBrowserOAuthEnabled     bool
	DevSigningKeyFile          string
	MaximumAttachmentBytes     int64
	StorageMode                StorageMode
	LocalPictureDirectory      string
	StagingBucket              string
	PublishedBucket            string
	CursorSecret               []byte
	AllowedOrigins             []string
	MaintenanceAudience        string
	MaintenanceEmails          []string
	NotificationAppURL         string
	NotificationWorkerInterval time.Duration
	SMTPAddress                string
	SMTPFrom                   string
	SMTPUsername               string
	SMTPPassword               string
	SMTPAllowLocalPlaintext    bool
}

func value(name, fallback string) string {
	if text, present := os.LookupEnv(name); present {
		return text
	}
	return fallback
}

func Load() (Config, error) {
	var result Config
	result.Environment = Environment(value("APP_ENV", "development"))
	if result.Environment != Development && result.Environment != Test && result.Environment != Production {
		return result, errors.New("APP_ENV must be development, test or production")
	}
	production := result.Environment == Production || os.Getenv("K_SERVICE") != ""
	if production && result.Environment != Production {
		return result, errors.New("Cloud Run requires APP_ENV=production")
	}
	port, err := strconv.ParseUint(value("PORT", "8080"), 10, 16)
	if err != nil || port == 0 {
		return result, errors.New("PORT must be between 1 and 65535")
	}
	result.Port = uint16(port)
	result.DatabaseURL = os.Getenv("DATABASE_URL")
	databaseURL, err := url.Parse(result.DatabaseURL)
	if err != nil || databaseURL.Host == "" || databaseURL.Path == "" || (databaseURL.Scheme != "postgres" && databaseURL.Scheme != "postgresql") {
		return result, errors.New("DATABASE_URL must be a PostgreSQL connection URL")
	}
	result.CloudSQLInstance = os.Getenv("CLOUD_SQL_INSTANCE")
	if production {
		parts := strings.Split(result.CloudSQLInstance, ":")
		if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
			return result, errors.New("production requires a Cloud SQL instance connection name")
		}
		if databaseURL.User == nil || databaseURL.User.Username() == "" {
			return result, errors.New("production requires the IAM database user")
		}
		if _, present := databaseURL.User.Password(); present {
			return result, errors.New("production database URL uses IAM authentication without a password")
		}
	}
	result.CompanyLocation, err = time.LoadLocation(value("COMPANY_TIMEZONE", "Africa/Cairo"))
	if err != nil {
		return result, errors.New("COMPANY_TIMEZONE must be a valid IANA zone")
	}
	result.AuthMode = AuthMode(value("AUTH_MODE", "oidc"))
	if result.AuthMode != OIDC && result.AuthMode != DevelopmentAuth {
		return result, errors.New("unsupported AUTH_MODE")
	}
	if production && result.AuthMode != OIDC {
		return result, errors.New("development authentication is forbidden in production")
	}
	result.MCPBrowserOAuthEnabled, err = strconv.ParseBool(value("MCP_BROWSER_OAUTH_ENABLED", "false"))
	if err != nil {
		return result, errors.New("MCP_BROWSER_OAUTH_ENABLED must be a boolean")
	}
	result.Issuer = os.Getenv("AUTH_ISSUER")
	if err := validateURL(result.Issuer, production); err != nil || !strings.HasSuffix(result.Issuer, "/") {
		return result, errors.New("AUTH_ISSUER must be an absolute issuer URL with trailing slash")
	}
	result.RESTAudience, result.MCPAudience = os.Getenv("REST_AUDIENCE"), os.Getenv("MCP_AUDIENCE")
	for _, audience := range []string{result.RESTAudience, result.MCPAudience} {
		if err := validateURL(audience, production); err != nil {
			return result, errors.New("audiences must be absolute service URLs")
		}
	}
	if result.RESTAudience == result.MCPAudience {
		return result, errors.New("REST and MCP audiences must be distinct")
	}
	restURL, _ := url.Parse(result.RESTAudience)
	mcpURL, _ := url.Parse(result.MCPAudience)
	if restURL.Path != "/api" || mcpURL.Path != "/mcp" || restURL.Scheme != mcpURL.Scheme || restURL.Host != mcpURL.Host {
		return result, errors.New("REST and MCP audiences must use the canonical service origin with /api and /mcp paths")
	}
	result.RequiredScope = value("AUTH_REQUIRED_SCOPE", "gategoldjira:access")
	if result.RequiredScope != "gategoldjira:access" {
		return result, errors.New("AUTH_REQUIRED_SCOPE must be gategoldjira:access")
	}
	result.DevSigningKeyFile = os.Getenv("DEV_SIGNING_KEY_FILE")
	if result.AuthMode == DevelopmentAuth && result.DevSigningKeyFile == "" {
		return result, errors.New("development authentication requires its signing-key file")
	}
	maximumBytes, err := strconv.ParseInt(value("MAXIMUM_ATTACHMENT_BYTES", "10485760"), 10, 64)
	if err != nil || maximumBytes < 1 || maximumBytes > 104857600 {
		return result, errors.New("MAXIMUM_ATTACHMENT_BYTES must be between 1 and 104857600")
	}
	result.MaximumAttachmentBytes = maximumBytes
	result.StorageMode = StorageMode(value("STORAGE_MODE", "gcs"))
	if result.StorageMode != GCS && result.StorageMode != LocalStorage {
		return result, errors.New("unsupported STORAGE_MODE")
	}
	if production && result.StorageMode != GCS {
		return result, errors.New("local storage is forbidden in production")
	}
	result.LocalPictureDirectory = os.Getenv("LOCAL_PICTURE_DIRECTORY")
	if result.StorageMode == LocalStorage {
		if result.LocalPictureDirectory == "" {
			return result, errors.New("local picture storage requires a persistent directory")
		}
		result.LocalPictureDirectory, err = filepath.Abs(result.LocalPictureDirectory)
		if err != nil {
			return result, errors.New("invalid local picture directory")
		}
	}
	result.StagingBucket, result.PublishedBucket = os.Getenv("STAGING_BUCKET"), os.Getenv("PUBLISHED_BUCKET")
	if result.StorageMode == GCS && (result.StagingBucket == "" || result.PublishedBucket == "" || result.StagingBucket == result.PublishedBucket) {
		return result, errors.New("GCS requires separate staging and published buckets")
	}
	result.CursorSecret, err = os.ReadFile(os.Getenv("CURSOR_SECRET_FILE"))
	if err != nil || len(result.CursorSecret) < 32 {
		return result, errors.New("CURSOR_SECRET_FILE must contain at least 32 secret bytes")
	}
	for _, origin := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if err := validateURL(origin, production); err != nil {
			return result, errors.New("ALLOWED_ORIGINS must contain exact absolute origins")
		}
		parsed, _ := url.Parse(origin)
		if parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return result, errors.New("CORS origins must not contain paths, queries or fragments")
		}
		result.AllowedOrigins = append(result.AllowedOrigins, origin)
	}
	result.NotificationAppURL = value("NOTIFICATION_APP_URL", result.AllowedOrigins[0])
	if err := validateURL(result.NotificationAppURL, production); err != nil {
		return result, errors.New("NOTIFICATION_APP_URL must be an absolute frontend URL")
	}
	interval, err := strconv.Atoi(value("NOTIFICATION_WORKER_INTERVAL_SECONDS", "60"))
	if err != nil || interval < 10 || interval > 3600 {
		return result, errors.New("NOTIFICATION_WORKER_INTERVAL_SECONDS must be between10 and3600")
	}
	result.NotificationWorkerInterval = time.Duration(interval) * time.Second
	result.SMTPAddress = os.Getenv("SMTP_ADDRESS")
	result.SMTPFrom = os.Getenv("SMTP_FROM")
	result.SMTPUsername = os.Getenv("SMTP_USERNAME")
	result.SMTPPassword = os.Getenv("SMTP_PASSWORD")
	result.SMTPAllowLocalPlaintext, err = strconv.ParseBool(value("SMTP_ALLOW_LOCAL_PLAINTEXT", "false"))
	if err != nil {
		return result, errors.New("SMTP_ALLOW_LOCAL_PLAINTEXT must be a boolean")
	}
	if result.SMTPAddress == "" {
		if result.SMTPFrom != "" || result.SMTPUsername != "" || result.SMTPPassword != "" || result.SMTPAllowLocalPlaintext {
			return result, errors.New("SMTP settings require SMTP_ADDRESS")
		}
	} else {
		host, port, parseErr := net.SplitHostPort(result.SMTPAddress)
		numericPort, portErr := strconv.ParseUint(port, 10, 16)
		from, mailErr := mail.ParseAddress(result.SMTPFrom)
		if parseErr != nil || host == "" || portErr != nil || numericPort == 0 || mailErr != nil || from.Address != result.SMTPFrom || strings.ContainsAny(result.SMTPAddress+result.SMTPFrom+result.SMTPUsername, "\r\n") {
			return result, errors.New("SMTP requires a valid host:port and sender address")
		}
		if (result.SMTPUsername == "") != (result.SMTPPassword == "") {
			return result, errors.New("SMTP username and password must be supplied together")
		}
		if result.SMTPAllowLocalPlaintext && (production || (host != "localhost" && host != "127.0.0.1" && host != "::1")) {
			return result, errors.New("plaintext SMTP is available only for a local development sink")
		}
	}

	result.MaintenanceAudience = os.Getenv("MAINTENANCE_AUDIENCE")
	for _, email := range strings.Split(os.Getenv("MAINTENANCE_SERVICE_EMAILS"), ",") {
		if email != "" {
			if !strings.HasSuffix(email, ".gserviceaccount.com") || strings.ContainsAny(email, " \t\r\n") {
				return result, errors.New("maintenance identities must be exact service-account emails")
			}
			result.MaintenanceEmails = append(result.MaintenanceEmails, email)
		}
	}
	if result.MaintenanceAudience != "" || len(result.MaintenanceEmails) > 0 || production {
		if result.MaintenanceAudience != strings.TrimSuffix(result.RESTAudience, "/api")+"/internal/maintenance/pictures" || len(result.MaintenanceEmails) == 0 {
			return result, errors.New("maintenance requires the exact service URL audience and allowed service-account identities")
		}
	}
	return result, nil
}

func validateURL(text string, httpsOnly bool) error {
	parsed, err := url.Parse(text)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("invalid absolute URL")
	}
	if httpsOnly && parsed.Scheme != "https" {
		return errors.New("production URL requires HTTPS")
	}
	return nil
}
