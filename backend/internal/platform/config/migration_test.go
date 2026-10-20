package config

import "testing"

func TestMigrationConfigurationUsesItsOwnIdentityWithoutRuntimeSecrets(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://migration@project.iam@localhost/gategoldjira?sslmode=disable")
	t.Setenv("CLOUD_SQL_INSTANCE", "project:europe-west1:database")
	t.Setenv("CURSOR_SECRET_FILE", "")
	if _, err := LoadMigration(); err != nil {
		t.Fatal(err)
	}
	for _, dsn := range []string{"postgres://runtime:password@localhost/gategoldjira", "invalid"} {
		t.Setenv("DATABASE_URL", dsn)
		if _, err := LoadMigration(); err == nil {
			t.Fatal("invalid production migration connection")
		}
	}
	t.Setenv("APP_ENV", "development")
	t.Setenv("CLOUD_SQL_INSTANCE", "")
	t.Setenv("DATABASE_URL", "postgres://local:password@127.0.0.1/gategoldjira")
	t.Setenv("K_SERVICE", "")
	if _, err := LoadMigration(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("K_SERVICE", "migration-job")
	if _, err := LoadMigration(); err == nil {
		t.Fatal("development migration on Cloud Run")
	}
}
