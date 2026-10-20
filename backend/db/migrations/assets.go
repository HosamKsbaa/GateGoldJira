package migrations

import (
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/net/html"
	"net/url"
	"sort"
	"strings"
)

func backfillAssets(ctx context.Context, pool *pgxpool.Pool) error {
	var available bool
	if err := pool.QueryRow(ctx, "SELECT to_regprocedure('backfill_legacy_assets(integer)') IS NOT NULL").Scan(&available); err != nil {
		return err
	}
	if !available {
		return nil
	}
	for _, query := range []string{"SELECT backfill_legacy_assets(1000)", "SELECT backfill_legacy_asset_reservations(1000)"} {
		for {
			tx, err := pool.Begin(ctx)
			if err != nil {
				return err
			}
			var count int
			err = tx.QueryRow(ctx, query).Scan(&count)
			if err != nil {
				_ = tx.Rollback(context.WithoutCancel(ctx))
				return err
			}
			if err = tx.Commit(ctx); err != nil {
				return err
			}
			if count == 0 {
				break
			}
		}
	}
	// An interrupted scan is safely repeatable: retained versions are immutable
	// and INSERT ON CONFLICT adds references without modifying their saved HTML.
	return backfillAssetReferences(ctx, pool)
}
func legacyFileReferences(value string, issue uuid.UUID) []uuid.UUID {
	document, err := html.Parse(strings.NewReader(value))
	if err != nil {
		return nil
	}
	ids := map[uuid.UUID]bool{}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "a" {
			for _, attr := range node.Attr {
				if attr.Key != "href" {
					continue
				}
				link, err := url.Parse(attr.Val)
				if err != nil || link.Path != "/issues/"+issue.String() {
					continue
				}
				id, err := uuid.Parse(link.Query().Get("attachment"))
				if err == nil && id != uuid.Nil {
					ids[id] = true
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(document)
	result := make([]uuid.UUID, 0, len(ids))
	for id := range ids {
		result = append(result, id)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].String() < result[j].String() })
	return result
}
func backfillAssetReferences(ctx context.Context, pool *pgxpool.Pool) error {
	projectCursor := uuid.Nil
	for {
		var project uuid.UUID
		err := pool.QueryRow(ctx, "SELECT id FROM projects WHERE id>$1 ORDER BY id LIMIT 1", projectCursor).Scan(&project)
		if err == pgx.ErrNoRows {
			return nil
		}
		if err != nil {
			return err
		}
		commentCursor := uuid.Nil
		var versionCursor int64
		for {
			tx, err := pool.Begin(ctx)
			if err != nil {
				return err
			}
			count, nextComment, nextVersion, err := copyAssetReferenceBatch(ctx, tx, project, commentCursor, versionCursor)
			if err != nil {
				_ = tx.Rollback(context.WithoutCancel(ctx))
				return err
			}
			if err = tx.Commit(ctx); err != nil {
				return err
			}
			if count < 100 {
				break
			}
			commentCursor = nextComment
			versionCursor = nextVersion
		}
		projectCursor = project
	}
}
func copyAssetReferenceBatch(ctx context.Context, tx pgx.Tx, project, after uuid.UUID, afterVersion int64) (int, uuid.UUID, int64, error) {
	if _, err := tx.Exec(ctx, "SELECT singleton FROM company_settings WHERE singleton FOR SHARE"); err != nil {
		return 0, after, afterVersion, err
	}
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:'||$1::uuid::text,0))", project); err != nil {
		return 0, after, afterVersion, err
	}
	if _, err := tx.Exec(ctx, "SELECT id FROM projects WHERE id=$1 FOR UPDATE", project); err != nil {
		return 0, after, afterVersion, err
	}
	type version struct {
		comment, issue uuid.UUID
		revision       int64
		value          string
	}
	rows, err := tx.Query(ctx, "SELECT v.comment_id,v.issue_id,v.revision,v.safe_html FROM comment_versions v JOIN comments c ON c.id=v.comment_id WHERE c.project_id=$1 AND (v.comment_id,v.revision)>($2,$3) ORDER BY v.comment_id,v.revision LIMIT 100", project, after, afterVersion)
	if err != nil {
		return 0, after, afterVersion, err
	}
	versions := make([]version, 0, 100)
	for rows.Next() {
		v := version{}
		if err = rows.Scan(&v.comment, &v.issue, &v.revision, &v.value); err != nil {
			rows.Close()
			return 0, after, afterVersion, err
		}
		versions = append(versions, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return 0, after, afterVersion, err
	}
	for _, v := range versions {
		if _, err = tx.Exec(ctx, "INSERT INTO comment_version_attachments(comment_id,version,issue_id,attachment_id) SELECT comment_id,version,issue_id,picture_id FROM comment_version_pictures WHERE comment_id=$1 AND version=$2 ON CONFLICT DO NOTHING", v.comment, v.revision); err != nil {
			return 0, after, afterVersion, err
		}
		ids := legacyFileReferences(v.value, v.issue)
		if len(ids) > 0 {
			if _, err = tx.Exec(ctx, "INSERT INTO comment_version_attachments(comment_id,version,issue_id,attachment_id) SELECT $1,$2,$3,id FROM asset_attachments WHERE issue_id=$3 AND kind='file' AND id=ANY($4::uuid[]) ON CONFLICT DO NOTHING", v.comment, v.revision, v.issue, ids); err != nil {
				return 0, after, afterVersion, err
			}
		}
		after = v.comment
		afterVersion = v.revision
	}
	return len(versions), after, afterVersion, nil
}
