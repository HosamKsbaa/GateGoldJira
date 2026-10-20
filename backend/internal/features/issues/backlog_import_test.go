package issues

import (
	"context"
	"encoding/csv"
	"errors"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

func TestBacklogAtomicCreationIndependentRankAndCurrentPermissions(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	active := f.create(t, "Active work")
	planned := []IssueView{}
	for _, title := range []string{"First planned", "Second planned", "Third planned"} {
		v, err := f.service.Create(ctx, f.member, CreateInput{
			ProjectID:         f.project,
			CreateIssueFields: CreateIssueFields{Title: title, Backlog: true},
			RetryReference:    uuid.NewString(),
		})
		if err != nil {
			t.Fatal(err)
		}
		planned = append(planned, v.Body.Result)
		if !v.Body.Result.Summary.Backlog || v.Body.Result.SourceOrderRevision != active.SourceOrderRevision {
			t.Fatal("planned creation changed active column order")
		}
	}
	limit := 1
	page, err := f.service.Backlog(ctx, f.viewer, BacklogInput{
		ProjectID: f.project,
		Page:      command.PageRequest{Limit: &limit},
	})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != planned[0].Summary.ID || page.NextCursor == nil || page.TotalMatching != 3 {
		t.Fatal("bounded ordered viewer read", err)
	}
	in := BacklogReorderInput{
		IssueID: planned[2].Summary.ID,
		BacklogReorderFields: BacklogReorderFields{
			ExpectedRevision:      planned[2].Summary.Revision,
			ExpectedOrderRevision: page.OrderRevision,
			NeighborID:            planned[0].Summary.ID,
			Before:                true,
		},
		RetryReference: uuid.NewString(),
	}
	if _, err = f.service.ReorderBacklog(ctx, f.viewer, in); err == nil {
		t.Fatal("viewer changed planning order")
	}
	out, err := f.service.ReorderBacklog(ctx, f.member, in)
	if err != nil || out.Body.Result.OrderRevision != page.OrderRevision+1 {
		t.Fatal("planning reorder", err)
	}
	replayActor := f.member
	replayActor.Channel = command.MCP
	replay, err := f.service.ReorderBacklog(ctx, replayActor, in)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.OrderRevision != out.Body.Result.OrderRevision {
		t.Fatal("ranking retry duplicated", err)
	}
	if _, err = f.service.Backlog(ctx, f.member, BacklogInput{
		ProjectID: f.project,
		Page:      command.PageRequest{Cursor: page.NextCursor},
	}); err == nil {
		t.Fatal("stale ordering cursor accepted")
	}
	ordered, err := f.service.Backlog(ctx, f.member, BacklogInput{ProjectID: f.project})
	if err != nil || ordered.Items[0].ID != planned[2].Summary.ID {
		t.Fatal("rank did not persist", err)
	}
	current, err := f.service.Get(ctx, f.member, active.Summary.ID)
	if err != nil || current.SourceOrderRevision != active.SourceOrderRevision {
		t.Fatal("backlog ranking changed active order", err)
	}
	_, err = f.service.Organize(ctx, f.member, OrganizeInput{
		IssueID: planned[2].Summary.ID,
		OrganizeFields: OrganizeFields{
			ExpectedRevision: out.Body.Result.Issue.Summary.Revision,
			Backlog:          new(false),
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	ordered, err = f.service.Backlog(ctx, f.member, BacklogInput{ProjectID: f.project})
	if err != nil || ordered.TotalMatching != 2 || ordered.OrderRevision != out.Body.Result.OrderRevision+1 {
		t.Fatal("activation left stale planning order", err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now(),revision=revision+1 WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.service.ReorderBacklog(ctx, f.member, in); err == nil {
		t.Fatal("revoked member replay bypassed permissions")
	}
}

func TestCSVImportMappingPartialErrorsFormulaSafeExportAndStableSourceIdentity(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	fields := ImportPreviewFields{
		CSV: "External,Work,Owner,Due,Tags\nEXT-1,عمل عربي 😀,member@test.dev,2026-10-31,urgent;API\nEXT-2,,member@test.dev,invalid,\nEXT-3,=HYPERLINK(unsafe),,2026-11-01,api\n",
		Mapping: ImportMapping{
			SourceKey: "External",
			Title:     "Work",
			Assignee:  "Owner",
			DueDate:   "Due",
			Labels:    "Tags",
		},
	}
	preview, err := f.service.PreviewImport(ctx, f.member, ImportPreviewInput{
		ProjectID:           f.project,
		ImportPreviewFields: fields,
	})
	if err != nil || preview.ValidCount != 2 || preview.ErrorCount != 1 || len(preview.Rows[1].Errors) < 2 {
		t.Fatal("preview missing field errors", err)
	}
	if _, err = f.service.PreviewImport(ctx, f.viewer, ImportPreviewInput{
		ProjectID:           f.project,
		ImportPreviewFields: fields,
	}); err == nil {
		t.Fatal("viewer previewed a write import")
	}
	in := ImportInput{
		ProjectID: f.project,
		ImportFields: ImportFields{
			ImportPreviewFields: fields,
			Backlog:             true,
			BatchID:             uuid.NewString(),
		},
		RetryReference: uuid.NewString(),
	}
	first, err := f.service.Import(ctx, f.member, in)
	if err != nil || first.Body.Result.CreatedCount != 2 || first.Body.Result.FailedCount != 1 {
		t.Fatal("valid rows not imported", err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.service.Import(ctx, actor, in)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Rows[0].IssueID == nil || *replay.Body.Result.Rows[0].IssueID != *first.Body.Result.Rows[0].IssueID {
		t.Fatal("batch retry duplicated rows", err)
	}
	in.BatchID = uuid.NewString()
	in.RetryReference = uuid.NewString()
	second, err := f.service.Import(ctx, f.member, in)
	if err != nil || second.Body.Result.ExistingCount != 2 || second.Body.Result.CreatedCount != 0 {
		t.Fatal("source keys not deduplicated across batches", err)
	}
	page, err := f.service.Backlog(ctx, f.member, BacklogInput{ProjectID: f.project})
	if err != nil || page.TotalMatching != 2 {
		t.Fatal("CSV creation lost planning context", err)
	}
	exported, err := f.service.Export(ctx, f.viewer, ExportInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	records, err := csv.NewReader(strings.NewReader(exported.CSV)).ReadAll()
	if err != nil || len(records) != 3 || exported.TotalMatching != 2 {
		t.Fatal("bounded CSV export", err)
	}
	foundSafe := false
	for _, row := range records[1:] {
		if strings.HasPrefix(row[1], "'=HYPERLINK") {
			foundSafe = true
		}
	}
	if !foundSafe {
		t.Fatal("export permits spreadsheet formula execution")
	}
	in.CSV = "title\nChanged\n"
	if _, err = f.service.Import(ctx, f.member, in); err == nil {
		t.Fatal("changed batch retry accepted")
	}
	if _, _, err = readCSV("title,title\nOne,Two\n"); err == nil {
		t.Fatal("duplicate CSV headers accepted")
	}
	duplicate, err := f.service.PreviewImport(ctx, f.member, ImportPreviewInput{
		ProjectID:           f.project,
		ImportPreviewFields: ImportPreviewFields{CSV: "title,sourceKey\nOne,SAME\nDifferent,SAME\n"},
	})
	if err != nil || duplicate.ValidCount != 1 || duplicate.ErrorCount != 1 || duplicate.Rows[1].Errors[0].Field != "sourceKey" {
		t.Fatal("preview did not identify repeated source identities", err)
	}
}

func TestCSVTransientFailureResumesCommittedRowsWithoutPermanentFailure(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	_, err := f.pool.Exec(ctx, `CREATE FUNCTION test_import_busy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='Temporary' THEN RAISE EXCEPTION 'temporary test contention' USING ERRCODE='55P03'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_import_busy BEFORE INSERT ON labels FOR EACH ROW EXECUTE FUNCTION test_import_busy();`)
	if err != nil {
		t.Fatal(err)
	}
	in := ImportInput{
		ProjectID: f.project,
		ImportFields: ImportFields{
			ImportPreviewFields: ImportPreviewFields{CSV: "title,labels\nCommitted row,\nResume row,Temporary\n"},
			BatchID:             uuid.NewString(),
			Backlog:             true,
		},
		RetryReference: uuid.NewString(),
	}
	_, err = f.service.Import(ctx, f.member, in)
	var failure *command.Failure
	if !errors.As(err, &failure) || !failure.Retryable {
		t.Fatal("temporary row failure should leave batch resumable", err)
	}
	var issues int
	var completed bool
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1", f.project.UUID).Scan(&issues); err != nil || issues != 1 {
		t.Fatal("expected first bounded row committed", err)
	}
	if err = f.pool.QueryRow(ctx, "SELECT result IS NOT NULL FROM idempotency_records WHERE actor_id=$1 AND retry_reference=$2", f.member.UserID.UUID, in.RetryReference).Scan(&completed); err != nil || completed {
		t.Fatal("temporary failure froze a batch result", err)
	}
	if _, err = f.pool.Exec(ctx, "DROP TRIGGER test_import_busy ON labels; DROP FUNCTION test_import_busy();"); err != nil {
		t.Fatal(err)
	}
	out, err := f.service.Import(ctx, f.member, in)
	if err != nil || out.Body.Result.FailedCount != 0 {
		t.Fatal("resumption failed", err)
	}
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1", f.project.UUID).Scan(&issues); err != nil || issues != 2 {
		t.Fatal("resume duplicated a committed row", err)
	}
}

func TestCSVFormulaSourceIdentityRoundTripAndReturnedBacklogRank(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	in := ImportInput{
		ProjectID: f.project,
		ImportFields: ImportFields{
			ImportPreviewFields: ImportPreviewFields{CSV: "title,sourceKey\nOriginal,=FORMULA()\n"},
			BatchID:             uuid.NewString(),
			Backlog:             true,
		},
		RetryReference: uuid.NewString(),
	}
	first, err := f.service.Import(ctx, f.member, in)
	if err != nil {
		t.Fatal(err)
	}
	exported, err := f.service.Export(ctx, f.member, ExportInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(exported.CSV, "=FORMULA()") {
		t.Fatal("unsafe identity leaked into spreadsheet cell")
	}
	in.CSV = exported.CSV
	in.BatchID = uuid.NewString()
	in.RetryReference = uuid.NewString()
	reimported, err := f.service.Import(ctx, f.member, in)
	if err != nil || reimported.Body.Result.ExistingCount != 1 || reimported.Body.Result.CreatedCount != 0 {
		t.Fatal("escaped source identity duplicated work", err)
	}
	issue, err := f.service.Get(ctx, f.member, *first.Body.Result.Rows[0].IssueID)
	if err != nil {
		t.Fatal(err)
	}
	active, err := f.service.Organize(ctx, f.member, OrganizeInput{
		IssueID: issue.Summary.ID,
		OrganizeFields: OrganizeFields{
			ExpectedRevision: issue.Summary.Revision,
			Backlog:          new(false),
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	planned, err := f.service.Create(ctx, f.member, CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: CreateIssueFields{Title: "Current plan", Backlog: true},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE issues SET backlog_rank=1024 WHERE project_id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	returned, err := f.service.Organize(ctx, f.member, OrganizeInput{
		IssueID: issue.Summary.ID,
		OrganizeFields: OrganizeFields{
			ExpectedRevision: active.Body.Result.Summary.Revision,
			Backlog:          new(true),
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	page, err := f.service.Backlog(ctx, f.member, BacklogInput{ProjectID: f.project})
	if err != nil || len(page.Items) != 2 || page.Items[1].ID != issue.Summary.ID {
		t.Fatal("returned plan did not append safely", err)
	}
	_, err = f.service.ReorderBacklog(ctx, f.member, BacklogReorderInput{
		IssueID: returned.Body.Result.Summary.ID,
		BacklogReorderFields: BacklogReorderFields{
			ExpectedRevision:      returned.Body.Result.Summary.Revision,
			ExpectedOrderRevision: page.OrderRevision,
			NeighborID:            planned.Body.Result.Summary.ID,
			Before:                true,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal("returned plan cannot be ranked", err)
	}
}
