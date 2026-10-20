package migrations_test

import (
	"context"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMakeMigrationBackfillsPopulatedLegacyDatabaseAndCanRestart(t *testing.T) {
	f := legacyAssetsAt(t, 10, false)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	target := f.pool.Config().ConnConfig.Database
	if !strings.HasPrefix(target, "gg_test_") {
		t.Fatal("migration regression requires a disposable test database")
	}
	connection, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	connection.Path = "/" + target
	dsn := connection.String()
	parsed, err := pgxpool.ParseConfig(dsn)
	if err != nil || parsed.ConnConfig.Database != target {
		t.Fatal("migration connection does not select the disposable fixture")
	}
	for attempt := 0; attempt < 2; attempt++ {
		cmd := exec.CommandContext(ctx, "make", "--no-print-directory", "db-migrate")
		cmd.Dir = root
		cmd.Env = append(os.Environ(), "APP_ENV=test", "DATABASE_URL=", "TEST_DATABASE_URL="+dsn, "CLOUD_SQL_INSTANCE=", "K_SERVICE=")
		if err := cmd.Run(); err != nil {
			t.Fatalf("guarded Make migration attempt %d failed: %v", attempt+1, err)
		}
	}
	var expectedVersion int64
	names, err := fs.Glob(migrations.Files, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range names {
		prefix, _, ok := strings.Cut(name, "_")
		if !ok {
			continue
		}
		number, err := strconv.ParseInt(prefix, 10, 64)
		if err != nil {
			t.Fatal(err)
		}
		if number > expectedVersion {
			expectedVersion = number
		}
	}
	var version, revision int64
	var title, html string
	var assets, references int
	if err = f.pool.QueryRow(ctx, "SELECT max(version_id) FROM goose_db_version WHERE is_applied").Scan(&version); err != nil || version != expectedVersion {
		t.Fatal("migration version", version, err)
	}
	if err = f.pool.QueryRow(ctx, "SELECT title,revision FROM issue_records WHERE id=$1 AND type_id IS NOT NULL AND priority_id IS NOT NULL AND workflow_id IS NOT NULL AND stage_id IS NOT NULL", f.issue).Scan(&title, &revision); err != nil || title != "Retain original references" || revision != 9007199254740993 {
		t.Fatal("original issue changed or canonical references missing", err)
	}
	if err = f.pool.QueryRow(ctx, "SELECT safe_html FROM comment_versions WHERE comment_id=$1", f.comment).Scan(&html); err != nil || html != f.html {
		t.Fatal("original rich comment changed", err)
	}
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM attachments WHERE id IN($1,$2)", f.picture, f.file).Scan(&assets); err != nil || assets != 2 {
		t.Fatal("historical assets missing", assets, err)
	}
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM comment_version_attachments WHERE comment_id=$1 AND attachment_id=$2", f.comment, f.picture).Scan(&references); err != nil || references != 1 {
		t.Fatal("historical image reference missing", references, err)
	}
}
