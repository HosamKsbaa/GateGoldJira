package migrations_test

import (
	"context"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
	"time"
)

type assetFixture struct {
	pool                                                     *pgxpool.Pool
	actor, project, issue, picture, file, reference, comment uuid.UUID
	html                                                     string
}

func legacyAssets(t *testing.T, collision bool) assetFixture { return legacyAssetsAt(t, 16, collision) }
func legacyAssetsAt(t *testing.T, version int64, collision bool) assetFixture {
	t.Helper()
	ctx := context.Background()
	f := assetFixture{
		pool:      testenv.Database(t),
		actor:     uuid.New(),
		project:   uuid.New(),
		issue:     uuid.New(),
		picture:   uuid.New(),
		file:      uuid.New(),
		reference: uuid.New(),
		comment:   uuid.New(),
	}
	if collision {
		f.file = f.picture
	}
	if err := migrations.ApplyThrough(ctx, f.pool, version); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'asset@test.dev','asset@test.dev','Asset owner',now(),true)", f.actor); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'ASSET','Preserved media',$2)", f.project, f.actor); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) SELECT $1,unnest(ARRAY['todo','in_progress','review','done']) ON CONFLICT DO NOTHING", f.project); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank,revision) VALUES($1,$2,1,'Retain original references',$3,9007199254740993,9007199254740993)", f.issue, f.project, f.actor); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO pictures(id,project_id,issue_id,uploaded_by,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_gallery,uploaded_at,expires_at,published_at)
 VALUES($1,$2,$3,$4,'قديم.png','وصف محفوظ','image/png',128,repeat('a',64),'original/image/staging',9007199254740993,'original/image/published',9007199254740995,'published',true,'2001-01-01','2001-01-02','2001-01-01 01:00:00+00')`, f.picture, f.project, f.issue, f.actor); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO attachments(id,project_id,issue_id,uploaded_by,filename,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,attached,uploaded_at)
 VALUES($1,$2,$3,$4,'قديم.txt','text/plain',64,repeat('b',64),'original/file/staging',9007199254740997,'original/file/published',9007199254740999,false,'2001-01-01')`, f.file, f.project, f.issue, f.actor); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO upload_reservations(actor_id,retry_reference,command_hash,picture_id,project_id,issue_id,staging_key,staging_generation,published_key,published_generation,checksum,lease_until,state,created_at,updated_at)
 VALUES($1,$2,repeat('c',64),$3,$4,$5,'original/image/staging',9007199254740993,'original/image/published',9007199254740995,repeat('a',64),'2001-01-01 00:00:45+00','committed','2001-01-01','2001-01-01 01:00:00+00')`, f.actor, f.reference, f.picture, f.project, f.issue); err != nil {
		t.Fatal(err)
	}
	f.html = `<p dir="rtl">نسخة محفوظة<img data-picture-id="` + f.picture.String() + `"></p><p><a href="https://old.example.test/issues/` + f.issue.String() + `?attachment=` + f.file.String() + `">قديم.txt</a></p>`
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "INSERT INTO comments(id,project_id,issue_id,author_id,created_at) VALUES($1,$2,$3,$4,'2001-01-01')", f.comment, f.project, f.issue, f.actor); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO comment_versions(comment_id,revision,issue_id,safe_html,plain_text,created_at) VALUES($1,1,$2,$3,'نسخة محفوظة','2001-01-01')", f.comment, f.issue, f.html); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO comment_version_pictures(comment_id,version,issue_id,picture_id) VALUES($1,1,$2,$3)", f.comment, f.issue, f.picture); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	return f
}

func TestUnifiedAssetExpansionPreservesMetadataReferencesAndLeaseIdentity(t *testing.T) {
	f := legacyAssets(t, false)
	ctx := context.Background()
	if err := migrations.Apply(ctx, f.pool); err != nil {
		t.Fatal(err)
	}
	var kind, key, checksum string
	var generation int64
	var uploaded time.Time
	if err := f.pool.QueryRow(ctx, "SELECT kind,published_key,published_generation,checksum,uploaded_at FROM asset_attachments WHERE id=$1", f.picture).Scan(&kind, &key, &generation, &checksum, &uploaded); err != nil || kind != "image" || key != "original/image/published" || generation != 9007199254740995 || checksum != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" || uploaded.Year() != 2001 {
		t.Fatal("image metadata changed", kind, key, generation, err)
	}
	var inPanel, inventedTime bool
	if err := f.pool.QueryRow(ctx, "SELECT in_panel,published_at IS NOT NULL FROM asset_attachments WHERE id=$1", f.file).Scan(&inPanel, &inventedTime); err != nil || inPanel || inventedTime {
		t.Fatal("file visibility changed or physical publication time invented", err)
	}
	var hash string
	var lease time.Time
	var asset uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT asset_id,command_hash,lease_until FROM asset_upload_reservations WHERE actor_id=$1 AND retry_reference=$2", f.actor, f.reference).Scan(&asset, &hash, &lease); err != nil || asset != f.picture || hash != "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" || lease.Year() != 2001 || lease.Second() != 45 {
		t.Fatal("reservation identity changed", err)
	}
	var html string
	var refs int
	var revision int64
	if err := f.pool.QueryRow(ctx, "SELECT safe_html FROM comment_versions WHERE comment_id=$1 AND revision=1", f.comment).Scan(&html); err != nil || html != f.html {
		t.Fatal("immutable HTML rewritten", err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM comment_version_attachments WHERE comment_id=$1", f.comment).Scan(&refs); err != nil || refs != 2 {
		t.Fatal("image or legacy document reference missing", refs, err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT revision FROM issues WHERE id=$1", f.issue).Scan(&revision); err != nil || revision != 9007199254740993 {
		t.Fatal("representation backfill edited issue", err)
	}
	var events int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM activity_events").Scan(&events); err != nil || events != 0 {
		t.Fatal("invented asset backfill events", err)
	}
}

func TestUnifiedAssetCollisionStopsExpansionWithoutLosingEitherLegacyRow(t *testing.T) {
	f := legacyAssets(t, true)
	ctx := context.Background()
	if err := migrations.Apply(ctx, f.pool); err == nil {
		t.Fatal("ambiguous cross-family ID silently reconciled")
	}
	var count int
	if err := f.pool.QueryRow(ctx, "SELECT (SELECT count(*) FROM pictures)+(SELECT count(*) FROM attachments)").Scan(&count); err != nil || count != 2 {
		t.Fatal("legacy collision lost data", count, err)
	}
}
