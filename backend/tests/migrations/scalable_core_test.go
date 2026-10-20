package migrations_test

import (
	"bytes"
	"context"
	"encoding/json"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestLegacyMediaPreflightReportsCollisionsWithoutChangingPreservedMetadata(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.ApplyThrough(ctx, pool, 16); err != nil {
		t.Fatal(err)
	}
	actor := command.Actor{
		UserID:  command.NewID[command.UserKind](),
		Channel: command.REST,
		Today:   command.Today(time.Now(), time.UTC),
	}
	project, issue := command.NewID[command.ProjectKind](), command.NewID[command.IssueKind]()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'migration@test.dev','migration@test.dev','Migration admin',now(),true)", actor.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'KEEP','Preserved',$2)", project.UUID, actor.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) VALUES($1,'todo')", project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank) VALUES($1,$2,1,'Keep original metadata',$3,1024)", issue.UUID, project.UUID, actor.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	id := uuid.New()
	if _, err := pool.Exec(ctx, `INSERT INTO pictures(id,project_id,issue_id,uploaded_by,filename,description,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_gallery,expires_at,published_at)
 VALUES($1,$2,$3,$4,'old.png','Old image','image/png',128,repeat('a',64),'staging/collision',1,'published/collision',1,'published',true,now()+interval '24 hours',now())`, id, project.UUID, issue.UUID, actor.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO attachments(id,project_id,issue_id,uploaded_by,filename,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation)
 VALUES($1,$2,$3,$4,'old.txt','text/plain',128,repeat('b',64),'staging/collision',1,'published/collision',1)`, id, project.UUID, issue.UUID, actor.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	reference := uuid.New()
	if _, err := pool.Exec(ctx, `INSERT INTO upload_reservations(actor_id,retry_reference,command_hash,picture_id,project_id,issue_id,staging_key,lease_until,state)
 VALUES($1,$2,repeat('c',64),$3,$4,$5,'staging/image-transfer',now()+interval '45 seconds','uploading')`, actor.UserID.UUID, reference, uuid.New(), project.UUID, issue.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO attachment_upload_reservations(actor_id,retry_reference,command_hash,attachment_id,project_id,issue_id,staging_key,lease_until,state)
 VALUES($1,$2,repeat('d',64),$3,$4,$5,'staging/file-transfer',now()+interval '45 seconds','uploading')`, actor.UserID.UUID, reference, uuid.New(), project.UUID, issue.UUID); err != nil {
		t.Fatal(err)
	}
	out, err := configuration.New(command.Runner{Pool: pool}, nil).Inspect(ctx, actor, project)
	if err != nil || out.Ready || len(out.Problems) != 4 {
		t.Fatal("identity/key/retry collision preflight", out, err)
	}
	seen := map[configuration.ProblemCode]bool{}
	for _, problem := range out.Problems {
		seen[problem.Code] = true
	}
	for _, code := range []configuration.ProblemCode{
		configuration.AssetIDCollision,
		configuration.StagingKeyCollision,
		configuration.PublishedKeyCollision,
		configuration.RetryCollision,
	} {
		if !seen[code] {
			t.Fatal("missing collision", code)
		}
	}
	var revision int64
	var title string
	if err := pool.QueryRow(ctx, "SELECT revision,title FROM issues WHERE id=$1", issue.UUID).Scan(&revision, &title); err != nil || revision != 1 || title != "Keep original metadata" {
		t.Fatal("preflight changed preserved issue", revision, title, err)
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM activity_events").Scan(&count); err != nil || count != 0 {
		t.Fatal("preflight created an activity", count, err)
	}
}

func TestConfigurationExpansionPreservesPopulatedLegacyWorkAndRetiredStages(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.ApplyThrough(ctx, pool, 10); err != nil {
		t.Fatal(err)
	}
	actor, project, issue := uuid.New(), uuid.New(), uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'expand@test.dev','expand@test.dev','Expansion admin',now(),true)", actor); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'EXPAND','Populated legacy',$2)", project, actor); err != nil {
		t.Fatal(err)
	}
	qa, retired := "review:"+uuid.NewString(), "review:"+uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO project_status_order(project_id,status,stage_name)
 SELECT $1,s,s FROM unnest(ARRAY['todo','in_progress','review','done',$2,$3]::text[]) s`, project, qa, retired); err != nil {
		t.Fatal(err)
	}
	flow := command.BoardWorkflow{Columns: []command.WorkflowColumn{
		{Status: command.Todo, Name: "To do", AllowedTargets: []command.Status{command.InProgress}},
		{Status: command.InProgress, Name: "Doing", AllowedTargets: []command.Status{command.Status(qa)}},
		{Status: command.Review, Name: "Review", AllowedTargets: []command.Status{command.Done}},
		{Status: command.Done, Name: "Done", AllowedTargets: []command.Status{command.Todo}},
		{Status: command.Status(qa), Name: "QA", AllowedTargets: []command.Status{command.Done}},
	}}
	raw, err := json.Marshal(flow)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by,is_default,workflow) VALUES($1,$2,'All Issues','all issues',$3,true,$4)", uuid.New(), project, actor, raw); err != nil {
		t.Fatal(err)
	}
	flow.Columns = append(flow.Columns, command.WorkflowColumn{
		Status:         command.Status(retired),
		Name:           "Old QA",
		AllowedTargets: []command.Status{command.Done},
	})
	archivedRaw, err := json.Marshal(flow)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by,archived_at,workflow) VALUES($1,$2,'Old layout','old layout',$3,now(),$4)", uuid.New(), project, actor, archivedRaw); err != nil {
		t.Fatal(err)
	}
	stamp := time.Date(2025, 3, 2, 12, 13, 14, 0, time.UTC)
	description := `<p dir="rtl">وصف قديم <img data-picture-id="` + uuid.NewString() + `"></p>`
	if _, err = pool.Exec(ctx, `INSERT INTO issues(id,project_id,number,title,description,description_format,type,priority,status,reporter_id,rank,revision,created_at,updated_at)
 VALUES($1,$2,42,'مهمة عربية محفوظة',$3,'html','bug','high',$4,$5,2048,7,$6,$6)`, issue, project, description, qa, actor, stamp); err != nil {
		t.Fatal(err)
	}
	retry := uuid.New()
	original := []byte(`{"result":{"preserved":"original legacy response"}}`)
	if _, err = pool.Exec(ctx, `INSERT INTO idempotency_records(actor_id,retry_reference,operation,canonical_input_hash,result,result_version)
 VALUES($1,$2,'update_issue',repeat('a',64),$3,1)`, actor, retry, original); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, "SELECT result FROM idempotency_records WHERE actor_id=$1 AND retry_reference=$2", actor, retry).Scan(&original); err != nil {
		t.Fatal(err)
	}
	if err = migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	var typeKey, priorityKey, stageToken, html string
	var revision int64
	var created, updated time.Time
	if err = pool.QueryRow(ctx, `SELECT t.key,p.key,s.legacy_status,i.description,i.revision,i.created_at,i.updated_at
 FROM issues i JOIN issue_types t ON t.id=i.type_id JOIN priorities p ON p.id=i.priority_id
 JOIN workflow_stages s ON s.id=i.stage_id AND s.workflow_id=i.workflow_id WHERE i.id=$1`, issue).Scan(&typeKey, &priorityKey, &stageToken, &html, &revision, &created, &updated); err != nil {
		t.Fatal(err)
	}
	if typeKey != "bug" || priorityKey != "high" || stageToken != qa || html != description || revision != 7 || !created.Equal(stamp) || !updated.Equal(stamp) {
		t.Fatal("backfill changed original work", typeKey, priorityKey, stageToken, revision, created, updated)
	}
	var isRetired, accepts bool
	if err = pool.QueryRow(ctx, "SELECT retired,accepts_entries FROM workflow_stages WHERE project_id=$1 AND legacy_status=$2", project, retired).Scan(&isRetired, &accepts); err != nil || !isRetired || accepts {
		t.Fatal("retired archived stage history", isRetired, accepts, err)
	}
	var transitions int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM workflow_transitions WHERE project_id=$1", project).Scan(&transitions); err != nil || transitions != 5 {
		t.Fatal("active move equivalence", transitions, err)
	}
	var retained []byte
	if err = pool.QueryRow(ctx, "SELECT result FROM idempotency_records WHERE actor_id=$1 AND retry_reference=$2", actor, retry).Scan(&retained); err != nil || !bytes.Equal(retained, original) {
		t.Fatal("legacy replay bytes changed", err)
	}
	var archivedBoards, events int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM boards WHERE project_id=$1 AND archived_at IS NOT NULL", project).Scan(&archivedBoards); err != nil || archivedBoards != 1 {
		t.Fatal("archived layout lost", archivedBoards, err)
	}
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE project_id=$1", project).Scan(&events); err != nil || events != 0 {
		t.Fatal("representation backfill emitted content events", events, err)
	}
}

func TestConfigurationBackfillCommitsBoundedBatchesAndResumesWithLegacyWriters(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.ApplyThrough(ctx, pool, 10); err != nil {
		t.Fatal(err)
	}
	actor, project, other := uuid.New(), uuid.New(), uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'resume@test.dev','resume@test.dev','Resume admin',now(),true)", actor); err != nil {
		t.Fatal(err)
	}
	for i, id := range []uuid.UUID{project, other} {
		if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,$2,'Resume fixture',$3)", id, []string{"RESUME", "OTHER"}[i], actor); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) SELECT $1,unnest(ARRAY['todo','in_progress','review','done'])", id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO issues(id,project_id,number,title,reporter_id,rank)
 SELECT gen_random_uuid(),$1,n,'Preserve batch '||n,$2,n*1024 FROM generate_series(1,2500) n`, project, actor); err != nil {
		t.Fatal(err)
	}
	if err := migrations.ApplyThrough(ctx, pool, 12); err != nil {
		t.Fatal(err)
	}
	var remaining, batch int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE type_id IS NULL").Scan(&remaining); err != nil || remaining != 2500 {
		t.Fatal("expansion did not precede backfill", remaining, err)
	}
	if err := pool.QueryRow(ctx, "SELECT backfill_legacy_issue_configuration(500)").Scan(&batch); err != nil || batch != 500 {
		t.Fatal("bounded batch", batch, err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE type_id IS NULL").Scan(&remaining); err != nil || remaining != 2000 {
		t.Fatal("batch size", remaining, err)
	}
	// Simulate an old revision writing after expansion has committed. Its bridge
	// fills all four references even before the resumed backfill reaches this row.
	var touched uuid.UUID
	if err := pool.QueryRow(ctx, "SELECT id FROM issues WHERE type_id IS NULL LIMIT 1").Scan(&touched); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE issues SET priority='high' WHERE id=$1", touched); err != nil {
		t.Fatal(err)
	}
	var key string
	if err := pool.QueryRow(ctx, "SELECT p.key FROM issues i JOIN priorities p ON p.id=i.priority_id WHERE i.id=$1", touched).Scan(&key); err != nil || key != "high" {
		t.Fatal("old writer bridge", key, err)
	}
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE type_id IS NULL OR revision<>1").Scan(&remaining); err != nil || remaining != 0 {
		t.Fatal("resume/content preservation", remaining, err)
	}
	// Scoped foreign keys reject cross-project references without trusting the
	// legacy writer bridge. Used stage meaning also remains immutable.
	var foreignPriority, usedStage uuid.UUID
	if err := pool.QueryRow(ctx, "SELECT id FROM priorities WHERE project_id=$1 LIMIT 1", other).Scan(&foreignPriority); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT stage_id FROM issues WHERE id=$1", touched).Scan(&usedStage); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE issues SET priority_id=$2 WHERE id=$1", touched, foreignPriority); err == nil {
		t.Fatal("cross-project priority accepted")
	}
	if _, err := pool.Exec(ctx, "UPDATE workflow_stages SET category='done' WHERE id=$1", usedStage); err == nil {
		t.Fatal("used stage category changed")
	}
	if _, err := pool.Exec(ctx, "UPDATE workflow_stages SET name='Renamed safely' WHERE id=$1", usedStage); err != nil {
		t.Fatal("safe stage name edit", err)
	}
}
