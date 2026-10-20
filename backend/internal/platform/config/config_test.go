package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func developmentEnvironment(t *testing.T) {
	t.Helper()
	secret := filepath.Join(t.TempDir(), "cursor-secret")
	if err := os.WriteFile(secret, []byte(strings.Repeat("a", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	values := map[string]string{
		"APP_ENV": "development", "K_SERVICE": "", "PORT": "8080", "DATABASE_URL": "postgres://dev:local@127.0.0.1:54329/dev?sslmode=disable",
		"AUTH_MODE": "development", "AUTH_ISSUER": "http://localhost:8080/development-identity/", "REST_AUDIENCE": "http://localhost:8080/api", "MCP_AUDIENCE": "http://localhost:8080/mcp",
		"DEV_SIGNING_KEY_FILE": "local-key.pem", "STORAGE_MODE": "local", "LOCAL_PICTURE_DIRECTORY": t.TempDir(), "CURSOR_SECRET_FILE": secret,
		"ALLOWED_ORIGINS": "http://localhost:4200", "COMPANY_TIMEZONE": "Africa/Cairo", "AUTH_REQUIRED_SCOPE": "gategoldjira:access",
		"NOTIFICATION_APP_URL": "", "NOTIFICATION_WORKER_INTERVAL_SECONDS": "60", "SMTP_ADDRESS": "", "SMTP_FROM": "", "SMTP_USERNAME": "", "SMTP_PASSWORD": "", "SMTP_ALLOW_LOCAL_PLAINTEXT": "false",
	}
	for key, value := range values {
		t.Setenv(key, value)
	}
	t.Setenv("NOTIFICATION_APP_URL", "http://localhost:4200")
}

func TestNotificationSMTPDefaultsValidationAndNoSecretErrors(t *testing.T) {
	developmentEnvironment(t)
	settings, err := Load()
	if err != nil || settings.SMTPAddress != "" || settings.NotificationWorkerInterval != time.Minute || settings.NotificationAppURL != "http://localhost:4200" {
		t.Fatal("notification defaults", err)
	}
	for _, test := range []struct{ key, value string }{
		{"SMTP_FROM", "jira@fixture.test"},
		{"SMTP_ADDRESS", "localhost:not-a-port"},
		{"NOTIFICATION_APP_URL", "file:///tmp/site"},
		{"NOTIFICATION_WORKER_INTERVAL_SECONDS", "0"},
		{"SMTP_ALLOW_LOCAL_PLAINTEXT", "maybe"},
	} {
		t.Run(test.key, func(t *testing.T) {
			developmentEnvironment(t)
			t.Setenv(test.key, test.value)
			if _, err := Load(); err == nil {
				t.Fatal("invalid notification config accepted")
			}
		})
	}
	developmentEnvironment(t)
	t.Setenv("SMTP_ADDRESS", "127.0.0.1:1025")
	t.Setenv("SMTP_FROM", "jira@fixture.test")
	t.Setenv("SMTP_ALLOW_LOCAL_PLAINTEXT", "true")
	t.Setenv("SMTP_PASSWORD", "private-fixture-password")
	if _, err := Load(); err == nil || strings.Contains(err.Error(), "private-fixture-password") {
		t.Fatal("credential pair validation exposed input", err)
	}
	t.Setenv("SMTP_USERNAME", "fixture")
	if _, err := Load(); err != nil {
		t.Fatal("local sink rejected", err)
	}
	t.Setenv("SMTP_ADDRESS", "smtp.example.test:587")
	if _, err := Load(); err == nil {
		t.Fatal("remote plaintext accepted")
	}
}

func TestDevelopmentAndProductionIsolation(t *testing.T) {
	developmentEnvironment(t)
	config, err := Load()
	if err != nil || config.CompanyLocation.String() != "Africa/Cairo" {
		t.Fatalf("development config: %v", err)
	}
	t.Setenv("K_SERVICE", "cloud-run-service")
	if _, err := Load(); err == nil {
		t.Fatal("Cloud Run accepted a development configuration")
	}
}

func TestInvalidExternalSettings(t *testing.T) {
	for _, test := range []struct{ key, value string }{
		{"PORT", "0"}, {"DATABASE_URL", "file:///database"}, {"COMPANY_TIMEZONE", "unknown/zone"},
		{"MCP_AUDIENCE", "http://localhost:8080/api"}, {"ALLOWED_ORIGINS", "*"}, {
			"ALLOWED_ORIGINS",
			"http://localhost:4200/path",
		},
		{"CURSOR_SECRET_FILE", "missing-file"}, {"AUTH_MODE", "none"}, {"STORAGE_MODE", "memory"},
	} {
		t.Run(test.key+test.value, func(t *testing.T) {
			developmentEnvironment(t)
			t.Setenv(test.key, test.value)
			if _, err := Load(); err == nil {
				t.Fatalf("accepted invalid %s", test.key)
			}
		})
	}
}
