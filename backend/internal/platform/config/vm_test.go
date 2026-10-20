package config

import "testing"

func TestVMHostedConfigurationSupportsPasswordsAndPersistentFiles(t *testing.T) {
	developmentEnvironment(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("DEPLOYMENT_TARGET", "vm")
	t.Setenv("CLOUD_SQL_INSTANCE", "")
	t.Setenv("DATABASE_URL", "postgres://jira:private-password@homes-db.internal/gategoldjira?sslmode=verify-full&sslrootcert=/etc/jira/ca.crt")
	t.Setenv("AUTH_MODE", "password")
	t.Setenv("AUTH_ISSUER", "https://jira.example.test/")
	t.Setenv("REST_AUDIENCE", "https://jira.example.test/api")
	t.Setenv("MCP_AUDIENCE", "https://jira.example.test/mcp")
	t.Setenv("ALLOWED_ORIGINS", "https://jira.example.test")
	t.Setenv("NOTIFICATION_APP_URL", "https://jira.example.test")
	t.Setenv("PASSWORD_SIGNING_KEY_FILE", "/etc/jira/signing-key.pem")
	t.Setenv("PASSWORD_CREDENTIALS_FILE", "/etc/jira/credentials.json")
	if _, err := Load(); err != nil {
		t.Fatal("valid VM production configuration refused", err)
	}
	t.Setenv("K_SERVICE", "managed-cloud-service")
	if _, err := Load(); err == nil {
		t.Fatal("VM configuration was accepted on Cloud Run")
	}
}

func TestVMProductionRequiresVerifiedTLSAndKeepsCloudRunIsolated(t *testing.T) {
	valid := "postgres://jira:private-password@homes-db.internal/gategoldjira?sslmode=verify-full&sslrootcert=/etc/jira/ca.crt"
	for _, test := range []struct {
		name, target, dsn, cloud string
		valid                    bool
	}{
		{"vm TLS", "vm", valid, "", true},
		{"plaintext", "vm", "postgres://jira:private-password@homes-db.internal/jira?sslmode=disable", "", false},
		{"unverified TLS", "vm", "postgres://jira:private-password@homes-db.internal/jira?sslmode=require&sslrootcert=/ca.crt", "", false},
		{"duplicate TLS mode", "vm", valid + "&sslmode=disable", "", false},
		{"host override", "vm", valid + "&host=other", "", false},
		{"missing identity", "vm", "postgres://homes-db.internal/jira?sslmode=verify-full&sslrootcert=/ca.crt", "", false},
		{"mixed connector", "vm", valid, "project:region:db", false},
		{"cloud password", "cloud-run", valid, "project:region:db", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("APP_ENV", "production")
			t.Setenv("K_SERVICE", "")
			t.Setenv("DEPLOYMENT_TARGET", test.target)
			t.Setenv("DATABASE_URL", test.dsn)
			t.Setenv("CLOUD_SQL_INSTANCE", test.cloud)
			_, err := LoadMigration()
			if (err == nil) != test.valid {
				t.Fatal("unexpected VM TLS validation", err)
			}
		})
	}
}
