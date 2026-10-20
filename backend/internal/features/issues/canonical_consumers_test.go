package issues

import (
	"context"
	"encoding/csv"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"strings"
	"testing"
)

func TestCanonicalImportExportAndBacklogRetainChoicesAndSourceIdentity(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	cfg := configuration.New(command.Runner{Pool: f.pool}, nil)
	current, err := cfg.Get(ctx, f.owner, configuration.GetInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	kindID, priorityID := command.NewID[command.IssueTypeKind](), command.NewID[command.PriorityKind]()
	kind, err := cfg.SaveType(ctx, f.owner, configuration.SaveTypeInput{
		ProjectID: f.project,
		TypeID:    kindID,
		SaveTypeFields: configuration.SaveTypeFields{
			ExpectedRevision: current.Revision,
			Key:              "story",
			Name:             "قصة",
			Behavior:         configuration.Standard,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = cfg.SavePriority(ctx, f.owner, configuration.SavePriorityInput{
		ProjectID:  f.project,
		PriorityID: priorityID,
		SavePriorityFields: configuration.SavePriorityFields{
			ExpectedRevision: kind.Body.Result.Configuration.Revision,
			Key:              "urgent",
			Name:             "عاجل",
			SortOrder:        4,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	fields := ImportPreviewFields{CSV: "title,type,priority,sourceKey\nقصة عربية,story,urgent,source-1\n"}
	preview, err := f.service.PreviewImport(ctx, f.member, ImportPreviewInput{
		ProjectID:           f.project,
		ImportPreviewFields: fields,
	})
	if err != nil || preview.ValidCount != 1 {
		t.Fatal("native preview", err, preview)
	}
	input := ImportInput{
		ProjectID: f.project,
		ImportFields: ImportFields{
			ImportPreviewFields: fields,
			Backlog:             true,
			BatchID:             uuid.NewString(),
		},
		RetryReference: uuid.NewString(),
	}
	saved, err := f.service.Import(ctx, f.member, input)
	if err != nil || saved.Body.Result.CreatedCount != 1 {
		t.Fatal("native import", err, saved.Body.Result)
	}
	id := *saved.Body.Result.Rows[0].IssueID
	view, err := f.service.GetModern(ctx, f.viewer, id)
	if err != nil || view.Summary.Type.ID != kindID || view.Summary.Priority.ID != priorityID || !view.Summary.Backlog {
		t.Fatal("lost canonical choices", err)
	}
	backlog, err := f.service.Backlog(ctx, f.viewer, BacklogInput{ProjectID: f.project})
	if err != nil || len(backlog.ModernItems) != 1 || backlog.ModernItems[0].Type.ID != kindID {
		t.Fatal("native backlog", err)
	}
	exported, err := f.service.Export(ctx, f.viewer, ExportInput{
		ProjectID:    f.project,
		ExportFields: ExportFields{Filters: command.IssueFilter{Backlog: new(true)}},
	})
	if err != nil {
		t.Fatal("native export", err)
	}
	rows, err := csv.NewReader(strings.NewReader(exported.CSV)).ReadAll()
	if err != nil || len(rows) != 2 || rows[1][4] != "story" || rows[1][5] != "urgent" || rows[1][12] != kindID.String() {
		t.Fatal("export projected custom choices", err)
	}
	again := input
	again.ImportPreviewFields.CSV = exported.CSV
	again.BatchID = uuid.NewString()
	again.RetryReference = uuid.NewString()
	repeated, err := f.service.Import(ctx, f.member, again)
	if err != nil || repeated.Body.Result.ExistingCount != 1 || *repeated.Body.Result.Rows[0].IssueID != id {
		t.Fatal("source identity duplicated", err, repeated.Body.Result)
	}
	var count int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1", f.project.UUID).Scan(&count); err != nil || count != 1 {
		t.Fatal("duplicated native import", count, err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.service.Import(ctx, actor, input)
	if err != nil || !replay.Body.Receipt.Replayed || *replay.Body.Result.Rows[0].IssueID != id {
		t.Fatal("import channel replay", err)
	}
}
