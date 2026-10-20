package database_test

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/tests/testenv"
)

func TestMigrationConnectionBootstrapsEmptyDatabaseAndReappliesSafely(t *testing.T) {
	pool := testenv.Database(t)
	ctx := context.Background()
	dsn, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	dsn.Path = "/" + pool.Config().ConnConfig.Database
	db, err := database.OpenForMigrations(ctx, config.Config{Environment: config.Test, DatabaseURL: dsn.String()})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var exists bool
	if err := db.Pool.QueryRow(ctx, "SELECT to_regclass('public.company_settings') IS NOT NULL").Scan(&exists); err != nil || exists {
		t.Fatal("fixture must start without application schema", err)
	}
	if err := migrations.Apply(ctx, db.Pool); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, "UPDATE company_settings SET cleanup_paused=true"); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Apply(ctx, db.Pool); err != nil {
		t.Fatal(err)
	}
	var paused bool
	if err := db.Pool.QueryRow(ctx, "SELECT cleanup_paused FROM company_settings").Scan(&paused); err != nil || !paused {
		t.Fatal("migration reapply rewrote existing settings", err)
	}
}

func TestPoolDecodesUTCInstantsOnANonUTCMachine(t *testing.T) {
	pool := testenv.Database(t)
	ctx := context.Background()
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	dsn, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	dsn.Path = "/" + pool.Config().ConnConfig.Database
	old := time.Local
	time.Local = time.FixedZone("Cairo", 3*60*60)
	defer func() { time.Local = old }()
	location, err := time.LoadLocation("Africa/Cairo")
	if err != nil {
		t.Fatal(err)
	}
	db, err := database.Open(ctx, config.Config{
		Environment:     config.Development,
		DatabaseURL:     dsn.String(),
		CompanyLocation: location,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var instant time.Time
	if err := db.Pool.QueryRow(ctx, "SELECT '2026-10-12T04:25:00+03:00'::timestamptz").Scan(&instant); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(instant)
	if err != nil || instant.Location() != time.UTC || string(encoded) != `"2026-10-12T01:25:00Z"` || !strings.HasSuffix(string(encoded), `Z"`) {
		t.Fatalf("noncanonical timestamp: %s (%v)", encoded, err)
	}
}
