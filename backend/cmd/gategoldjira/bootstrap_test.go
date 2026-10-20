package main

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/tests/testenv"
)

func TestOwnerBootstrapIsOnceOnlyAndNeverARegistrationRoute(t *testing.T) {
	pool := testenv.Database(t)
	ctx := context.Background()
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	secret := filepath.Join(root, "cursor")
	if err := os.WriteFile(secret, make([]byte, 32), 0600); err != nil {
		t.Fatal(err)
	}
	isolated, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	isolated.Path = "/" + pool.Config().ConnConfig.Database
	for name, value := range map[string]string{
		"APP_ENV":                 "development",
		"K_SERVICE":               "",
		"DATABASE_URL":            isolated.String(),
		"COMPANY_TIMEZONE":        "Africa/Cairo",
		"AUTH_MODE":               "development",
		"AUTH_ISSUER":             "http://localhost/development/",
		"REST_AUDIENCE":           "http://localhost/api",
		"MCP_AUDIENCE":            "http://localhost/mcp",
		"DEV_SIGNING_KEY_FILE":    filepath.Join(root, "key.pem"),
		"CURSOR_SECRET_FILE":      secret,
		"STORAGE_MODE":            "local",
		"LOCAL_PICTURE_DIRECTORY": filepath.Join(root, "pictures"),
		"ALLOWED_ORIGINS":         "http://localhost:4200",
	} {
		t.Setenv(name, value)
	}
	args := []string{"--email", "Owner@Example.test", "--name", "Owner", "--subject", "human|owner"}
	if err := bootstrapOwner(ctx, args); err != nil {
		t.Fatal(err)
	}
	if err := bootstrapOwner(ctx, []string{
		"--email",
		"other@example.test",
		"--name",
		"Other",
		"--subject",
		"human|other",
	}); err == nil {
		t.Fatal("bootstrap became general account registration")
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM users WHERE is_administrator AND email='owner@example.test'").Scan(&count); err != nil || count != 1 {
		t.Fatal("initial Administrator normalization failed")
	}
}
