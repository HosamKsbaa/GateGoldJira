package recovery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/jackc/pgx/v5"
)

type tableSnapshot struct {
	Count      int64  `json:"count"`
	ContentMD5 string `json:"contentMd5"`
}
type restoreManifest struct {
	SourceInstance   string                   `json:"sourceInstance"`
	RestoredInstance string                   `json:"restoredInstance"`
	BackupID         string                   `json:"backupId"`
	PITRPoint        time.Time                `json:"pitrPoint"`
	LastDurableWrite time.Time                `json:"lastDurableWrite"`
	IncidentAt       time.Time                `json:"incidentAt"`
	RestoreStartedAt time.Time                `json:"restoreStartedAt"`
	RestoreReadyAt   time.Time                `json:"restoreReadyAt"`
	StagingBucket    string                   `json:"stagingBucket"`
	PublishedBucket  string                   `json:"publishedBucket"`
	Tables           map[string]tableSnapshot `json:"tables"`
}

var retainedTables = []string{
	"users",
	"user_identities",
	"projects",
	"project_memberships",
	"project_status_order",
	"issues",
	"labels",
	"issue_labels",
	"issue_dependencies",
	"boards",
	"pictures",
	"comments",
	"comment_versions",
	"comment_version_pictures",
	"comment_version_mentions",
	"activity_events",
	"notifications",
}

// This verifies an operator-created isolated Cloud SQL clone. It never restores,
// deletes, migrates or changes the original database or published bucket.
func TestCloudBackupPITRRetainedStateAndImmutableBytes(t *testing.T) {
	if os.Getenv("RUN_CLOUD_RESTORE_TESTS") != "1" {
		t.Skip("Cloud restore pending: provide the authorized isolated clone and measured restore manifest")
	}
	file, err := os.Open(os.Getenv("GATEGOLD_RESTORE_MANIFEST"))
	if err != nil {
		t.Fatal("restore manifest unavailable")
	}
	defer file.Close()
	var m restoreManifest
	decoder := json.NewDecoder(io.LimitReader(file, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&m); err != nil {
		t.Fatal(err)
	}
	if m.SourceInstance == "" || m.SourceInstance == m.RestoredInstance || !strings.HasPrefix(m.RestoredInstance, "gg-restore-") || m.BackupID == "" || m.PublishedBucket == "" {
		t.Fatal("supply distinct isolated restored target and actual backup evidence")
	}
	if m.PITRPoint.IsZero() || m.LastDurableWrite.IsZero() || m.IncidentAt.Before(m.LastDurableWrite) || m.PITRPoint.Before(m.LastDurableWrite) || m.IncidentAt.Sub(m.LastDurableWrite) > 5*time.Minute || m.RestoreStartedAt.IsZero() || m.RestoreReadyAt.Before(m.RestoreStartedAt) || m.RestoreReadyAt.Sub(m.RestoreStartedAt) > 4*time.Hour || m.RestoreReadyAt.After(time.Now()) {
		t.Fatal("measured RPO/RTO evidence is invalid or outside budget")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	conn, err := pgx.Connect(ctx, os.Getenv("GATEGOLD_RESTORED_DATABASE_URL"))
	if err != nil {
		t.Fatal("cannot connect to isolated restored database")
	}
	defer conn.Close(ctx)
	if !strings.HasPrefix(conn.Config().Database, "gg_restore_") {
		t.Fatal("the drill must use an isolated renamed application database")
	}
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var paused bool
	if err := tx.QueryRow(ctx, "SELECT cleanup_paused FROM company_settings").Scan(&paused); err != nil || !paused {
		t.Fatal("pause/reconcile cleanup before verifying a restored target")
	}
	for _, table := range retainedTables {
		wanted, ok := m.Tables[table]
		if !ok || wanted.ContentMD5 == "" {
			t.Fatal("missing captured baseline", table)
		}
		var got tableSnapshot
		// Names come exclusively from the closed table vocabulary above.
		if err := tx.QueryRow(ctx, "SELECT count(*),md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY row_to_json(x)::text),'')) FROM "+table+" x").Scan(&got.Count, &got.ContentMD5); err != nil || got != wanted {
			t.Fatal("retained table mismatch", table, err)
		}
	}
	for _, query := range []string{
		`SELECT count(*) FROM issues child LEFT JOIN issues parent ON parent.id=child.parent_id WHERE child.parent_id IS NOT NULL AND (parent.id IS NULL OR parent.project_id<>child.project_id OR parent.type='subtask')`,
		`SELECT count(*) FROM issues parent JOIN issues child ON child.parent_id=parent.id WHERE parent.status='done' AND child.status<>'done'`,
		`SELECT count(*) FROM comments c LEFT JOIN comment_versions v ON v.comment_id=c.id AND v.revision=c.revision WHERE v.comment_id IS NULL`,
		`SELECT count(*) FROM comment_version_pictures ref LEFT JOIN pictures p ON p.id=ref.picture_id WHERE p.id IS NULL OR p.state<>'published' OR p.issue_id<>ref.issue_id`,
		`SELECT count(*) FROM notifications n LEFT JOIN activity_events e ON e.id=n.event_id WHERE e.id IS NULL`,
	} {
		var count int64
		if err := tx.QueryRow(ctx, query).Scan(&count); err != nil || count != 0 {
			t.Fatal("restored relationship invariant failed", err)
		}
	}
	store, err := objectstore.NewGoogle(ctx, m.StagingBucket, m.PublishedBucket)
	if err != nil {
		t.Fatal("private object verification unavailable")
	}
	defer store.Close()
	rows, err := tx.Query(ctx, "SELECT published_key,published_generation,byte_size,checksum,mime_type FROM pictures WHERE state='published' ORDER BY id")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	verified := 0
	for rows.Next() {
		var key, checksum, mime string
		var generation, size int64
		if err := rows.Scan(&key, &generation, &size, &checksum, &mime); err != nil {
			t.Fatal(err)
		}
		reader, err := store.Open(ctx, objectstore.Key(key), objectstore.Info{
			Generation:  generation,
			Size:        size,
			SHA256:      checksum,
			ContentType: mime,
		}, true)
		if err != nil {
			t.Fatal("immutable picture generation missing")
		}
		hash := sha256.New()
		n, err := io.Copy(hash, io.LimitReader(reader, size+1))
		reader.Close()
		if err != nil || n != size || hex.EncodeToString(hash.Sum(nil)) != checksum {
			t.Fatal("immutable picture checksum mismatch")
		}
		verified++
	}
	if rows.Err() != nil || verified == 0 {
		t.Fatal("drill must include actual immutable pictures", rows.Err())
	}
	t.Logf("Verified%d retained tables and%d published generations; recorded RPO=%s RTO=%s", len(retainedTables), verified, m.IncidentAt.Sub(m.LastDurableWrite), m.RestoreReadyAt.Sub(m.RestoreStartedAt))
}
