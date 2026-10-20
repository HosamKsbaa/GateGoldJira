package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func passwordVMEnvironment(t *testing.T) string {
	t.Helper()
	developmentEnvironment(t)
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "cursor-secret"), []byte(strings.Repeat("s", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	for key, value := range map[string]string{
		"APP_ENV": "production", "DEPLOYMENT_TARGET": "vm", "AUTH_MODE": "password",
		"CLOUD_SQL_INSTANCE": "", "K_SERVICE": "",
		"DATABASE_URL": "postgres://jira:private-database-marker@db.example.test/jira?sslmode=verify-full&sslrootcert=/etc/jira/ca.crt",
		"AUTH_ISSUER":  "https://jira.example.test/", "REST_AUDIENCE": "https://jira.example.test/api",
		"MCP_AUDIENCE": "https://jira.example.test/mcp", "ALLOWED_ORIGINS": "https://jira.example.test",
		"NOTIFICATION_APP_URL": "https://jira.example.test", "PASSWORD_SIGNING_KEY_FILE": "",
		"PASSWORD_CREDENTIALS_FILE": "", "CREDENTIALS_DIRECTORY": directory, "CURSOR_SECRET_FILE": "",
		"MCP_BROWSER_OAUTH_ENABLED": "false",
	} {
		t.Setenv(key, value)
	}
	return directory
}

func TestPasswordVMConfigBoundaryCredentialMountDefaultsAndExplicitPrecedence(t *testing.T) {
	directory := passwordVMEnvironment(t)
	settings, err := Load()
	if err != nil {
		t.Fatal("valid mounted-credential configuration rejected", err)
	}
	if settings.PasswordSigningKeyFile != filepath.Join(directory, "signing-key.pem") ||
		settings.PasswordCredentialsFile != filepath.Join(directory, "accounts.json") ||
		string(settings.CursorSecret) != strings.Repeat("s", 32) {
		t.Fatal("credential mount defaults did not retain their independent paths")
	}
	explicit := t.TempDir()
	for key, value := range map[string]string{
		"PASSWORD_SIGNING_KEY_FILE": filepath.Join(explicit, "explicit-key.pem"),
		"PASSWORD_CREDENTIALS_FILE": filepath.Join(explicit, "explicit-accounts.json"),
	} {
		t.Setenv(key, value)
	}
	settings, err = Load()
	if err != nil || settings.PasswordSigningKeyFile != filepath.Join(explicit, "explicit-key.pem") ||
		settings.PasswordCredentialsFile != filepath.Join(explicit, "explicit-accounts.json") {
		t.Fatal("credential mount replaced explicit operator paths")
	}
	// Configuration loading resolves paths; private key/account validation is
	// performed independently by the authentication constructor.
	if _, err := os.Stat(settings.PasswordSigningKeyFile); !os.IsNotExist(err) {
		t.Fatal("configuration loading unexpectedly provisioned a signing key")
	}
}

func TestPasswordVMConfigBoundaryMissingUnsafePathsAndOptionsFailClosed(t *testing.T) {
	for _, test := range []struct {
		name   string
		values map[string]string
	}{
		{"no-mount-or-paths", map[string]string{"CREDENTIALS_DIRECTORY": ""}},
		{"relative-mount", map[string]string{"CREDENTIALS_DIRECTORY": "relative-credentials"}},
		{"relative-key", map[string]string{"PASSWORD_SIGNING_KEY_FILE": "relative-key.pem"}},
		{"relative-accounts", map[string]string{"PASSWORD_CREDENTIALS_FILE": "relative-accounts.json"}},
		{"missing-cursor", map[string]string{"CURSOR_SECRET_FILE": "/nonexistent-private-cursor"}},
		{"invalid-browser-oauth-toggle", map[string]string{"MCP_BROWSER_OAUTH_ENABLED": "not-boolean"}},
		{"non-production-password-mode", map[string]string{"APP_ENV": "development"}},
		{"unknown-deployment-target", map[string]string{"DEPLOYMENT_TARGET": "untrusted-target"}},
		{"relative-persistent-picture-directory", map[string]string{"LOCAL_PICTURE_DIRECTORY": "relative-pictures"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			passwordVMEnvironment(t)
			for key, value := range test.values {
				t.Setenv(key, value)
			}
			if _, err := Load(); err == nil {
				t.Fatal("unsafe password VM configuration was accepted")
			} else if strings.Contains(err.Error(), "private-database-marker") {
				t.Fatal("configuration failure echoed database credentials")
			}
		})
	}
}

func TestPasswordVMConfigBoundaryVerifiedDatabaseIdentityAndAllowedOptions(t *testing.T) {
	for _, test := range []struct{ name, dsn string }{
		{"empty-user", "postgres://:private-database-marker@db.example.test/jira?sslmode=verify-full&sslrootcert=/etc/jira/ca.crt"},
		{"empty-password", "postgres://jira:@db.example.test/jira?sslmode=verify-full&sslrootcert=/etc/jira/ca.crt"},
		{"missing-password", "postgres://jira@db.example.test/jira?sslmode=verify-full&sslrootcert=/etc/jira/ca.crt"},
		{"relative-ca", "postgres://jira:private-database-marker@db.example.test/jira?sslmode=verify-full&sslrootcert=relative-ca.crt"},
		{"duplicate-ca", "postgres://jira:private-database-marker@db.example.test/jira?sslmode=verify-full&sslrootcert=/first.crt&sslrootcert=/second.crt"},
		{"unsupported-hostaddr", "postgres://jira:private-database-marker@db.example.test/jira?sslmode=verify-full&sslrootcert=/etc/jira/ca.crt&hostaddr=127.0.0.1"},
		{"missing-verified-mode", "postgres://jira:private-database-marker@db.example.test/jira?sslrootcert=/etc/jira/ca.crt"},
	} {
		t.Run(test.name, func(t *testing.T) {
			passwordVMEnvironment(t)
			t.Setenv("DATABASE_URL", test.dsn)
			if _, err := Load(); err == nil {
				t.Fatal("unsafe VM database connection was accepted")
			} else if strings.Contains(err.Error(), "private-database-marker") {
				t.Fatal("VM database error echoed credentials")
			}
		})
	}
	passwordVMEnvironment(t)
	t.Setenv("DATABASE_URL", "postgres://jira:private-database-marker@db.example.test/jira?sslmode=verify-full&sslrootcert=/etc/jira/ca.crt&application_name=jira&connect_timeout=5")
	if _, err := Load(); err != nil {
		t.Fatal("verified VM TLS with supported operational options was rejected", err)
	}
}
