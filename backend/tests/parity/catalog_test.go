package parity

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/features/boards"
	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/tests/testapp"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type catalogMatrix struct {
	runtime  *testapp.Runtime
	sessions map[command.UserID]*mcp.ClientSession
	routes   map[command.Operation]struct {
		Method, Path string
		APIVersion   int
	}
	seen map[command.Operation]bool
}

func newCatalogMatrix(t *testing.T) *catalogMatrix {
	t.Helper()
	r := testapp.NewRuntime(t)
	m := &catalogMatrix{runtime: r, sessions: map[command.UserID]*mcp.ClientSession{}, routes: map[command.Operation]struct {
		Method, Path string
		APIVersion   int
	}{}, seen: map[command.Operation]bool{}}
	raw, err := os.ReadFile("../../../specs/001-gategoldjira-mvp/contracts/operations.json")
	if err != nil {
		t.Fatal(err)
	}
	var catalog struct {
		Operations []struct {
			ID   command.Operation `json:"id"`
			REST struct {
				Method, Path string
				APIVersion   int
			} `json:"rest"`
		}
	}
	if err := json.Unmarshal(raw, &catalog); err != nil {
		t.Fatal(err)
	}
	var extension = catalog
	extension.Operations = nil
	extra, err := os.ReadFile("../../../specs/002-scalable-core/contracts/operations.json")
	if err != nil || json.Unmarshal(extra, &extension) != nil {
		t.Fatal("scalable-core catalog missing or invalid", err)
	}
	catalog.Operations = append(catalog.Operations, extension.Operations...)
	for _, op := range catalog.Operations {
		m.routes[op.ID] = op.REST
	}
	return m
}
func (m *catalogMatrix) session(t *testing.T, user command.UserID) *mcp.ClientSession {
	t.Helper()
	if s := m.sessions[user]; s != nil {
		return s
	}
	s := reference(t, m.runtime, user)
	m.sessions[user] = s
	return s
}

var pathArgument = regexp.MustCompile(`\{([A-Za-z]+)\}`)

// Dynamic JSON occurs only in this test's transport mapping, after a concrete
// typed input is marshalled. Business operations remain concrete typed DTOs.
func matrixREST[Input any](t *testing.T, m *catalogMatrix, user command.UserID, op command.Operation, input Input, authenticated bool) ([]byte, int) {
	t.Helper()
	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	fields := map[string]json.RawMessage{}
	if json.Unmarshal(encoded, &fields) != nil {
		t.Fatal("typed input was not an object")
	}
	route := m.routes[op]
	path := route.Path
	for _, match := range pathArgument.FindAllStringSubmatch(path, -1) {
		var value string
		if json.Unmarshal(fields[match[1]], &value) != nil {
			t.Fatal("invalid path mapping", op, match[1])
		}
		path = strings.ReplaceAll(path, match[0], url.PathEscape(value))
		delete(fields, match[1])
	}
	var retry string
	if raw, ok := fields["retryReference"]; ok {
		if json.Unmarshal(raw, &retry) != nil {
			t.Fatal("invalid retry mapping")
		}
		delete(fields, "retryReference")
	}
	var body io.Reader
	contentType := "application/json"
	if route.Method == "GET" {
		query := url.Values{}
		for name, raw := range fields {
			if name == "page" {
				var page command.PageRequest
				if json.Unmarshal(raw, &page) != nil {
					t.Fatal("invalid page")
				}
				if page.Limit != nil {
					b, _ := json.Marshal(*page.Limit)
					query.Set("limit", string(b))
				}
				if page.Cursor != nil {
					query.Set("cursor", *page.Cursor)
				}
				continue
			}
			var text string
			if json.Unmarshal(raw, &text) == nil {
				query.Set(name, text)
			} else {
				query.Set(name, string(raw))
			}
		}
		if len(query) > 0 {
			path += "?" + query.Encode()
		}
	} else if op == command.UploadPicture || op == command.UploadAttachment {
		var dataBase64, filename string
		var metadata []byte
		if op == command.UploadPicture {
			var upload pictures.Base64Upload
			if json.Unmarshal(fields["upload"], &upload) != nil {
				t.Fatal("invalid picture upload mapping")
			}
			dataBase64, filename = upload.DataBase64, upload.Filename
			metadata, _ = json.Marshal(upload.UploadMetadata)
		} else {
			var upload attachments.Base64Upload
			if json.Unmarshal(fields["upload"], &upload) != nil {
				t.Fatal("invalid attachment upload mapping")
			}
			dataBase64, filename = upload.DataBase64, upload.Filename
			metadata, _ = json.Marshal(upload.AttachmentUploadMetadata)
		}
		data, err := base64.StdEncoding.DecodeString(dataBase64)
		if err != nil {
			t.Fatal(err)
		}
		buffer := &bytes.Buffer{}
		writer := multipart.NewWriter(buffer)
		if err := writer.WriteField("metadata", string(metadata)); err != nil {
			t.Fatal(err)
		}
		file, err := writer.CreateFormFile("file", filename)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write(data); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		body = buffer
		contentType = writer.FormDataContentType()
	} else {
		encoded, err = json.Marshal(fields)
		if err != nil {
			t.Fatal(err)
		}
		body = bytes.NewReader(encoded)
	}
	version := route.APIVersion
	if version == 0 {
		version = 1
	}
	request, err := http.NewRequest(route.Method, m.runtime.URL+"/api/v"+strconv.Itoa(version)+path, body)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", contentType)
	if retry != "" {
		request.Header.Set("Idempotency-Key", retry)
	}
	if authenticated {
		request.Header.Set("Authorization", "Bearer "+m.runtime.Token(t, user, command.REST))
	}
	response, err := (&http.Client{Timeout: 30 * time.Second}).Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return raw, response.StatusCode
}
func matrixSave[Input, Value, Failure any](t *testing.T, m *catalogMatrix, user command.UserID, op command.Operation, input Input) Value {
	t.Helper()
	out := call[Input, command.Saved[Value], Failure](t, m.session(t, user), op, input)
	if !out.OK {
		t.Fatalf("%s failed: %+v", op, out.Error)
	}
	m.seen[op] = true
	// Verify the documented24h window and a separately wired instance, for every
	// mutation including multipart/base64 and private inbox commands.
	if _, err := m.runtime.Pool.Exec(context.Background(), "UPDATE idempotency_records SET created_at=now()-interval '23 hours 59 minutes' WHERE actor_id=$1 AND operation=$2", user.UUID, string(op)); err != nil {
		t.Fatal(err)
	}
	m.runtime.Restart(t)
	raw, status := matrixREST(t, m, user, op, input, true)
	var replay command.Saved[Value]
	if (status != 200 && status != 201) || json.Unmarshal(raw, &replay) != nil || !replay.Receipt.Replayed || !reflect.DeepEqual(replay.Result, out.Data.Result) || !reflect.DeepEqual(replay.Receipt.EventID, out.Data.Receipt.EventID) {
		t.Fatal("24h cross-channel restart replay mismatch", op, status, string(raw[:min(len(raw), 512)]))
	}
	if _, status := matrixREST(t, m, user, op, input, false); status != 401 {
		t.Fatal("unauthenticated mutation", op, status)
	}
	// Each saved result must remain behind current company approval, even when
	// the original token and retry reference are still cryptographically valid.
	if _, err := m.runtime.Pool.Exec(context.Background(), "UPDATE users SET disabled_at=now() WHERE id=$1", user.UUID); err != nil {
		t.Fatal(err)
	}
	if _, status := matrixREST(t, m, user, op, input, true); status != 403 {
		t.Fatal("revoked caller replayed", op, status)
	}
	deniedReplay, deniedError := m.session(t, user).CallTool(context.Background(), &mcp.CallToolParams{Name: string(op), Arguments: input})
	if deniedError == nil && deniedReplay != nil && !deniedReplay.IsError {
		t.Fatal("revoked MCP caller replayed", op)
	}
	// A forbidden transport response closes the SDK session; a newly approved
	// caller must reconnect rather than reuse that intentionally closed client.
	_ = m.sessions[user].Close()
	delete(m.sessions, user)
	if _, err := m.runtime.Pool.Exec(context.Background(), "UPDATE users SET disabled_at=NULL WHERE id=$1", user.UUID); err != nil {
		t.Fatal(err)
	}
	if op != command.MarkAllNotificationsRead && op != command.SetIssueWatch && op != command.UpdateNotificationPreferences {
		denied := call[Input, command.Saved[Value], Failure](t, m.session(t, m.runtime.Viewer), op, input)
		if denied.OK {
			t.Fatal("Viewer used another caller's write", op)
		}
	}
	return out.Data.Result
}
func matrixRead[Input, Value, Failure any](t *testing.T, m *catalogMatrix, user command.UserID, op command.Operation, input Input) Value {
	t.Helper()
	out := call[Input, Value, Failure](t, m.session(t, user), op, input)
	if !out.OK {
		t.Fatalf("read %s: %+v", op, out.Error)
	}
	m.seen[op] = true
	raw, status := matrixREST(t, m, user, op, input, true)
	if op == command.DownloadPicture || op == command.DownloadAttachment {
		var download struct {
			DataBase64 string `json:"dataBase64"`
		}
		encoded, _ := json.Marshal(out.Data)
		if json.Unmarshal(encoded, &download) != nil {
			t.Fatal("download shape")
		}
		data, err := base64.StdEncoding.DecodeString(download.DataBase64)
		if err != nil || status != 200 || !bytes.Equal(raw, data) {
			t.Fatal("binary/base64 read mismatch")
		}
	} else if op == command.GetKanbanReport {
		expected, err := json.Marshal(out.Data)
		if err != nil || status != 200 {
			t.Fatal("report transport failure", err, status)
		}
		assertEquivalentKanbanSnapshots(t, expected, raw)
	} else {
		var actual Value
		if status != 200 || json.Unmarshal(raw, &actual) != nil || !reflect.DeepEqual(actual, *out.Data) {
			t.Fatal("REST/MCP read mismatch", op, status)
		}
	}
	if _, status := matrixREST(t, m, user, op, input, false); status != 401 {
		t.Fatal("unauthenticated read", op, status)
	}
	return *out.Data
}

func TestAll133OperationsAnd71MutationReplaysUseRealServices(t *testing.T) {
	m := newCatalogMatrix(t)
	r := m.runtime
	admin, member := r.Admin, r.Member
	approved := matrixSave[identity.ApproveInput, identity.UserView, identity.IdentityFailureBody](t, m, admin, command.ApproveUser, identity.ApproveInput{
		Email:          "employee@matrix.dev",
		DisplayName:    "موظف",
		RetryReference: uuid.NewString(),
	})
	matrixSave[identity.UpdateUserInput, identity.UserView, identity.IdentityFailureBody](t, m, admin, command.UpdateUser, identity.UpdateUserInput{
		UserID:           approved.ID,
		ExpectedRevision: approved.Revision,
		Email:            approved.Email,
		DisplayName:      "موظف معتمد",
		Active:           true,
		RetryReference:   uuid.NewString(),
	})
	project := matrixSave[projects.CreateInput, projects.ProjectView, projects.ProjectFailureBody](t, m, admin, command.CreateProject, projects.CreateInput{
		Key:            "MATRIX",
		Name:           "مشروع",
		RetryReference: uuid.NewString(),
	})
	project = matrixSave[projects.UpdateInput, projects.ProjectView, projects.ProjectFailureBody](t, m, admin, command.UpdateProject, projects.UpdateInput{
		ProjectID:        project.ID,
		ExpectedRevision: project.Revision,
		Name:             "مشروع الفريق",
		Description:      "Retained",
		RetryReference:   uuid.NewString(),
	})
	for i, user := range []command.UserID{member, r.Viewer} {
		role := command.Member
		if i == 1 {
			role = command.Viewer
		}
		matrixSave[identity.SetMembershipInput, identity.MembershipView, identity.IdentityFailureBody](t, m, admin, command.SetMembership, identity.SetMembershipInput{
			ProjectID:      project.ID,
			UserID:         user,
			Role:           role,
			RetryReference: uuid.NewString(),
		})
	}
	label := matrixSave[issues.CreateLabelInput, issues.LabelView, issues.IssueFailureBody](t, m, member, command.CreateLabel, issues.CreateLabelInput{
		ProjectID:      project.ID,
		Name:           "عاجل",
		RetryReference: uuid.NewString(),
	})
	work := matrixSave[issues.CreateInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.CreateIssue, issues.CreateInput{
		ProjectID:      project.ID,
		Title:          "عمل عربي",
		AssigneeID:     &admin,
		RetryReference: uuid.NewString(),
	})
	due, _ := command.ParseDate("2026-10-20")
	work = matrixSave[issues.UpdateInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.UpdateIssue, issues.UpdateInput{
		IssueID:          work.Summary.ID,
		ExpectedRevision: work.Summary.Revision,
		Editable: issues.IssueEditable{
			Title:       work.Summary.Title,
			Description: "Typed",
			Type:        command.Task,
			Priority:    command.High,
			AssigneeID:  &admin,
			DueDate:     &due,
			LabelIDs:    []command.LabelID{label.ID},
		},
		RetryReference: uuid.NewString(),
	})
	work = matrixSave[issues.PatchFieldInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.PatchIssueField, issues.PatchFieldInput{
		IssueID: work.Summary.ID,
		PatchFieldFields: issues.PatchFieldFields{
			Field: issues.PriorityField,
			Priority: &issues.PriorityChange{
				Prior: work.Summary.Priority,
				Value: command.Low,
			},
		},
		RetryReference: uuid.NewString(),
	})
	child := matrixSave[issues.CreateSubtaskInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.CreateSubtask, issues.CreateSubtaskInput{
		ParentID:               work.Summary.ID,
		ExpectedParentRevision: work.Summary.Revision,
		Title:                  "Child",
		RetryReference:         uuid.NewString(),
	})
	sibling := matrixSave[issues.CreateInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.CreateIssue, issues.CreateInput{
		ProjectID:      project.ID,
		Title:          "Blocker",
		RetryReference: uuid.NewString(),
	})
	work = matrixRead[struct {
		IssueID command.IssueID `json:"issueId"`
	}, issues.IssueView, issues.IssueFailureBody](t, m, member, command.GetIssue, struct {
		IssueID command.IssueID `json:"issueId"`
	}{work.Summary.ID})
	link := matrixSave[issues.AddDependencyInput, issues.DependencyView, issues.IssueFailureBody](t, m, member, command.AddDependency, issues.AddDependencyInput{
		IssueID:               work.Summary.ID,
		BlockerID:             sibling.Summary.ID,
		ExpectedIssueRevision: work.Summary.Revision,
		ExpectedGraphRevision: work.GraphRevision,
		RetryReference:        uuid.NewString(),
	})
	matrixSave[issues.RemoveDependencyInput, issues.DependencyView, issues.IssueFailureBody](t, m, member, command.RemoveDependency, issues.RemoveDependencyInput{
		IssueID:                    work.Summary.ID,
		BlockerID:                  sibling.Summary.ID,
		ExpectedIssueRevision:      link.Dependent.Revision,
		ExpectedDependencyRevision: link.Revision,
		ExpectedGraphRevision:      link.GraphRevision,
		RetryReference:             uuid.NewString(),
	})
	sibling = matrixRead[struct {
		IssueID command.IssueID `json:"issueId"`
	}, issues.IssueView, issues.IssueFailureBody](t, m, member, command.GetIssue, struct {
		IssueID command.IssueID `json:"issueId"`
	}{sibling.Summary.ID})
	matrixSave[issues.ReorderInput, command.MoveResult, issues.IssueFailureBody](t, m, member, command.ReorderIssue, issues.ReorderInput{
		IssueID:               sibling.Summary.ID,
		ExpectedRevision:      sibling.Summary.Revision,
		ExpectedOrderRevision: sibling.SourceOrderRevision,
		NeighborIssueID:       work.Summary.ID,
		Placement:             issues.Before,
		RetryReference:        uuid.NewString(),
	})
	sibling = matrixRead[struct {
		IssueID command.IssueID `json:"issueId"`
	}, issues.IssueView, issues.IssueFailureBody](t, m, member, command.GetIssue, struct {
		IssueID command.IssueID `json:"issueId"`
	}{sibling.Summary.ID})
	var reviewOrder command.Revision
	for _, o := range sibling.OrderRevisions {
		if o.Status == command.Review {
			reviewOrder = o.Revision
		}
	}
	matrixSave[issues.MoveInput, command.MoveResult, issues.IssueFailureBody](t, m, member, command.MoveIssue, issues.MoveInput{
		IssueID:                     sibling.Summary.ID,
		ExpectedRevision:            sibling.Summary.Revision,
		TargetStatus:                command.Review,
		ExpectedSourceOrderRevision: sibling.SourceOrderRevision,
		ExpectedTargetOrderRevision: reviewOrder,
		RetryReference:              uuid.NewString(),
	})
	board := matrixSave[boards.CreateInput, command.BoardSummary, httpapi.FailureBody](t, m, member, command.CreateBoard, boards.CreateInput{
		ProjectID:      project.ID,
		Name:           "لوحة",
		SavedFilters:   command.IssueFilter{},
		RetryReference: uuid.NewString(),
	})
	limit := int32(1)
	board = matrixSave[boards.UpdateInput, command.BoardSummary, httpapi.FailureBody](t, m, member, command.UpdateBoard, boards.UpdateInput{
		BoardID:          board.ID,
		ExpectedRevision: board.Revision,
		Name:             "Review",
		SavedFilters:     command.IssueFilter{},
		WipLimits:        command.WipLimits{Review: &limit},
		RetryReference:   uuid.NewString(),
	})
	board = matrixSave[boards.RevisionInput, command.BoardSummary, httpapi.FailureBody](t, m, member, command.ArchiveBoard, boards.RevisionInput{
		BoardID:          board.ID,
		ExpectedRevision: board.Revision,
		RetryReference:   uuid.NewString(),
	})
	board = matrixSave[boards.RevisionInput, command.BoardSummary, httpapi.FailureBody](t, m, member, command.RestoreBoard, boards.RevisionInput{
		BoardID:          board.ID,
		ExpectedRevision: board.Revision,
		RetryReference:   uuid.NewString(),
	})
	photo := matrixSave[pictures.UploadToolInput, pictures.PictureView, httpapi.FailureBody](t, m, member, command.UploadPicture, pictures.UploadToolInput{
		IssueID: work.Summary.ID,
		Upload: pictures.Base64Upload{
			UploadMetadata: pictures.UploadMetadata{
				Filename:    "work.png",
				Description: "شرح",
				MIMEType:    "image/png",
				Publication: pictures.Gallery,
			},
			DataBase64: base64.StdEncoding.EncodeToString(testenv.PNG(t)),
		},
		RetryReference: uuid.NewString(),
	})
	attachment := matrixSave[attachments.UploadToolInput, attachments.AttachmentView, httpapi.FailureBody](t, m, member, command.UploadAttachment, attachments.UploadToolInput{
		IssueID: work.Summary.ID,
		Upload: attachments.Base64Upload{
			AttachmentUploadMetadata: attachments.AttachmentUploadMetadata{
				Filename: "متطلبات.txt",
				MIMEType: "text/plain",
			},
			DataBase64: base64.StdEncoding.EncodeToString([]byte("عمل عربي")),
		},
		RetryReference: uuid.NewString(),
	})
	comment := matrixSave[comments.CreateInput, comments.CommentView, comments.CommentFailureBody](t, m, member, command.CreateComment, comments.CreateInput{
		IssueID: work.Summary.ID,
		Body: comments.Body{
			HTML:           "<p>مرحبا</p>",
			MentionUserIDs: []command.UserID{},
			PictureIDs:     []command.PictureID{},
		},
		RetryReference: uuid.NewString(),
	})
	matrixSave[comments.UpdateInput, comments.CommentView, comments.CommentFailureBody](t, m, member, command.UpdateComment, comments.UpdateInput{
		CommentID:        comment.ID,
		ExpectedRevision: comment.Revision,
		Body: comments.Body{
			HTML:           "<p>تحديث</p>",
			MentionUserIDs: []command.UserID{},
			PictureIDs:     []command.PictureID{},
		},
		RetryReference: uuid.NewString(),
	})
	work = matrixRead[struct {
		IssueID command.IssueID `json:"issueId"`
	}, issues.IssueView, issues.IssueFailureBody](t, m, member, command.GetIssue, struct {
		IssueID command.IssueID `json:"issueId"`
	}{work.Summary.ID})
	matrixSave[pictures.DetachInput, pictures.PictureView, httpapi.FailureBody](t, m, member, command.DetachGalleryPicture, pictures.DetachInput{
		PictureID:             photo.ID,
		ExpectedIssueRevision: work.Summary.Revision,
		RetryReference:        uuid.NewString(),
	})
	work = matrixRead[struct {
		IssueID command.IssueID `json:"issueId"`
	}, issues.IssueView, issues.IssueFailureBody](t, m, member, command.GetIssue, struct {
		IssueID command.IssueID `json:"issueId"`
	}{work.Summary.ID})
	matrixSave[attachments.DetachInput, attachments.AttachmentView, httpapi.FailureBody](t, m, member, command.DetachAttachment, attachments.DetachInput{
		AttachmentID:          attachment.ID,
		ExpectedIssueRevision: work.Summary.Revision,
		RetryReference:        uuid.NewString(),
	})
	matrixRead[attachments.ListInput, command.Page[attachments.AttachmentView], httpapi.FailureBody](t, m, member, command.ListAttachments, attachments.ListInput{IssueID: work.Summary.ID})
	matrixRead[attachments.GetInput, attachments.AttachmentView, httpapi.FailureBody](t, m, member, command.GetAttachment, attachments.GetInput{AttachmentID: attachment.ID})
	matrixRead[attachments.GetInput, attachments.AttachmentDownload, httpapi.FailureBody](t, m, member, command.DownloadAttachment, attachments.GetInput{AttachmentID: attachment.ID})
	inbox := matrixRead[notifications.ListInput, command.Page[notifications.NotificationView], notifications.NotificationFailureBody](t, m, admin, command.ListNotifications, notifications.ListInput{})
	if len(inbox.Items) == 0 {
		t.Fatal("expected assignment/comment notifications")
	}
	notice := inbox.Items[0]
	matrixSave[notifications.SetReadInput, notifications.NotificationView, notifications.NotificationFailureBody](t, m, admin, command.SetNotificationRead, notifications.SetReadInput{
		NotificationID:   notice.ID,
		ExpectedRevision: notice.Revision,
		Read:             true,
		RetryReference:   uuid.NewString(),
	})
	matrixSave[notifications.MarkAllInput, notifications.MarkAllResult, notifications.NotificationFailureBody](t, m, admin, command.MarkAllNotificationsRead, notifications.MarkAllInput{RetryReference: uuid.NewString()})
	matrixRead[struct{}, identity.Me, identity.IdentityFailureBody](t, m, member, command.GetMe, struct{}{})
	matrixRead[struct{}, command.Page[identity.UserView], identity.IdentityFailureBody](t, m, admin, command.ListUsers, struct{}{})
	matrixRead[projects.ListInput, command.Page[projects.ProjectView], projects.ProjectFailureBody](t, m, member, command.ListProjects, projects.ListInput{})
	matrixRead[struct {
		ProjectID command.ProjectID `json:"projectId"`
	}, projects.ProjectView, projects.ProjectFailureBody](t, m, member, command.GetProject, struct {
		ProjectID command.ProjectID `json:"projectId"`
	}{project.ID})
	matrixRead[identity.MembershipListInput, command.Page[identity.MembershipView], identity.IdentityFailureBody](t, m, admin, command.ListMemberships, identity.MembershipListInput{ProjectID: project.ID})
	for _, op := range []command.Operation{command.ListAssignees, command.ListMentionCandidates} {
		matrixRead[identity.CandidateInput, command.Page[identity.UserSummary], identity.IdentityFailureBody](t, m, member, op, identity.CandidateInput{ProjectID: project.ID})
	}
	matrixRead[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, m, member, command.SearchIssues, issues.SearchInput{Filters: command.IssueFilter{ProjectIDs: []command.ProjectID{project.ID}}})
	matrixRead[issues.ListSubtasksInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, m, member, command.ListSubtasks, issues.ListSubtasksInput{ParentID: work.Summary.ID})
	matrixRead[issues.ListLabelsInput, command.Page[issues.LabelView], issues.IssueFailureBody](t, m, member, command.ListLabels, issues.ListLabelsInput{ProjectID: project.ID})
	matrixRead[boards.ListInput, command.Page[command.BoardSummary], httpapi.FailureBody](t, m, member, command.ListBoards, boards.ListInput{ProjectID: project.ID})
	matrixRead[boards.GetInput, command.BoardView, httpapi.FailureBody](t, m, member, command.GetBoard, boards.GetInput{BoardID: board.ID})
	matrixRead[boards.CardsInput, boards.CardPage, httpapi.FailureBody](t, m, member, command.ListBoardCards, boards.CardsInput{BoardID: board.ID, Status: command.Todo})
	matrixRead[issues.ListDependenciesInput, command.Page[issues.DependencyView], issues.IssueFailureBody](t, m, member, command.ListDependencies, issues.ListDependenciesInput{
		IssueID:   work.Summary.ID,
		Direction: issues.BlockedBy,
	})
	matrixRead[comments.ListInput, command.Page[comments.CommentView], comments.CommentFailureBody](t, m, member, command.ListComments, comments.ListInput{IssueID: work.Summary.ID})
	matrixRead[comments.ListVersionsInput, command.Page[comments.VersionView], comments.CommentFailureBody](t, m, member, command.ListCommentVersions, comments.ListVersionsInput{CommentID: comment.ID})
	matrixRead[pictures.ListInput, command.Page[pictures.PictureView], httpapi.FailureBody](t, m, member, command.ListPictures, pictures.ListInput{IssueID: work.Summary.ID})
	matrixRead[pictures.GetInput, pictures.PictureView, httpapi.FailureBody](t, m, member, command.GetPicture, pictures.GetInput{PictureID: photo.ID})
	matrixRead[pictures.GetInput, pictures.PictureDownload, httpapi.FailureBody](t, m, member, command.DownloadPicture, pictures.GetInput{PictureID: photo.ID})
	matrixRead[struct{}, notifications.InboxSummary, notifications.NotificationFailureBody](t, m, admin, command.GetInboxSummary, struct{}{})
	matrixRead[notifications.GetInput, notifications.NotificationView, notifications.NotificationFailureBody](t, m, admin, command.GetNotification, notifications.GetInput{NotificationID: notice.ID})
	matrixRead[activity.ListInput, command.Page[activity.ActivityView], httpapi.FailureBody](t, m, admin, command.ListActivity, activity.ListInput{ProjectID: &project.ID})
	work = matrixRead[struct {
		IssueID command.IssueID `json:"issueId"`
	}, issues.IssueView, issues.IssueFailureBody](t, m, member, command.GetIssue, struct {
		IssueID command.IssueID `json:"issueId"`
	}{work.Summary.ID})
	archived := true
	work = matrixSave[issues.OrganizeInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.OrganizeIssue, issues.OrganizeInput{
		IssueID: work.Summary.ID,
		OrganizeFields: issues.OrganizeFields{
			ExpectedRevision: work.Summary.Revision,
			Archived:         &archived,
		},
		RetryReference: uuid.NewString(),
	})
	matrixSave[issues.WatchInput, issues.WatchView, issues.IssueFailureBody](t, m, member, command.SetIssueWatch, issues.WatchInput{
		IssueID:        work.Summary.ID,
		Watching:       true,
		RetryReference: uuid.NewString(),
	})
	matrixSave[issues.LinkInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.SetIssueLink, issues.LinkInput{
		IssueID: work.Summary.ID,
		LinkFields: issues.LinkFields{
			ExpectedRevision: work.Summary.Revision,
			TargetID:         sibling.Summary.ID,
			Kind:             "relates_to",
			Enabled:          true,
		},
		RetryReference: uuid.NewString(),
	})
	matrixSave[issues.SaveSearchInput, issues.SavedSearch, issues.IssueFailureBody](t, m, member, command.SaveIssueSearch, issues.SaveSearchInput{
		SearchID:       command.NewID[issues.SearchKind](),
		Name:           "My issues",
		Filters:        command.IssueFilter{},
		RetryReference: uuid.NewString(),
	})
	matrixRead[struct{}, issues.SavedSearchList, issues.IssueFailureBody](t, m, member, command.ListSavedSearches, struct{}{})

	matrixPlanningAndIntegrations(t, m, project.ID, member, admin, sibling.Summary.ID)
	matrixBacklogImportAndPreferences(t, m, project.ID, member)

	matrixCanonicalWorkflows(t, m)
	matrixNativeBoards(t, m)
	matrixFieldsApprovals(t, m)
	matrixAssets(t, m)
	matrixActivation(t, m)
	cfg := matrixRead[configuration.GetInput, configuration.ConfigurationView, configuration.ConfigurationFailureBody](t, m, admin, command.GetProjectConfiguration, configuration.GetInput{ProjectID: project.ID})
	typeSaved := matrixSave[configuration.SaveTypeInput, configuration.TypeSaved, configuration.ConfigurationFailureBody](t, m, admin, command.SaveIssueType, configuration.SaveTypeInput{
		ProjectID: project.ID,
		TypeID:    command.NewID[command.IssueTypeKind](),
		SaveTypeFields: configuration.SaveTypeFields{
			ExpectedRevision: cfg.Revision,
			Key:              "story",
			Name:             "Story",
			Behavior:         configuration.Standard,
		},
		RetryReference: uuid.NewString(),
	})
	prioritySaved := matrixSave[configuration.SavePriorityInput, configuration.PrioritySaved, configuration.ConfigurationFailureBody](t, m, admin, command.SavePriority, configuration.SavePriorityInput{
		ProjectID:  project.ID,
		PriorityID: command.NewID[command.PriorityKind](),
		SavePriorityFields: configuration.SavePriorityFields{
			ExpectedRevision: typeSaved.Configuration.Revision,
			Key:              "urgent",
			Name:             "Urgent",
			SortOrder:        4,
		},
		RetryReference: uuid.NewString(),
	})
	matrixSave[configuration.SetDefaultsInput, configuration.ConfigurationView, configuration.ConfigurationFailureBody](t, m, admin, command.SetProjectDefaults, configuration.SetDefaultsInput{
		ProjectID: project.ID,
		SetDefaultsFields: configuration.SetDefaultsFields{
			ExpectedRevision: prioritySaved.Configuration.Revision,
			Defaults:         cfg.Defaults,
		},
		RetryReference: uuid.NewString(),
	})
	matrixRead[configuration.ListInput, command.Page[configuration.TypeView], configuration.ConfigurationFailureBody](t, m, admin, command.ListIssueTypes, configuration.ListInput{ProjectID: project.ID})
	matrixRead[configuration.ListInput, command.Page[configuration.PriorityView], configuration.ConfigurationFailureBody](t, m, admin, command.ListPriorities, configuration.ListInput{ProjectID: project.ID})
	matrixRead[identity.CandidateInput, command.Page[identity.MembershipCandidateView], identity.IdentityFailureBody](t, m, admin, command.ListMembershipCandidates, identity.CandidateInput{ProjectID: project.ID})
	project = matrixSave[projects.RevisionInput, projects.ProjectView, projects.ProjectFailureBody](t, m, admin, command.ArchiveProject, projects.RevisionInput{
		ProjectID:        project.ID,
		ExpectedRevision: project.Revision,
		RetryReference:   uuid.NewString(),
	})
	project = matrixSave[projects.RevisionInput, projects.ProjectView, projects.ProjectFailureBody](t, m, admin, command.RestoreProject, projects.RevisionInput{
		ProjectID:        project.ID,
		ExpectedRevision: project.Revision,
		RetryReference:   uuid.NewString(),
	})
	matrixSave[identity.RemoveMembershipInput, identity.MembershipView, identity.IdentityFailureBody](t, m, admin, command.RemoveMembership, identity.RemoveMembershipInput{
		ProjectID:        project.ID,
		UserID:           member,
		ExpectedRevision: 1,
		RetryReference:   uuid.NewString(),
	})
	if len(m.seen) != len(m.routes) {
		t.Fatalf("incomplete real workflow catalog: %d/133", len(m.seen))
	}
	mutations := 0
	for op := range m.seen {
		if op.IsMutation() {
			mutations++
		}
	}
	if mutations != 71 {
		t.Fatalf("mutation matrix incomplete: %d/71", mutations)
	}
	if child.Summary.Parent.Value.ID != work.Summary.ID {
		t.Fatal("child retained parent")
	}
	t.Log("All133 operations have concrete REST/MCP results; all71 mutations replay after instance restart at23h59m, with unauthenticated and Viewer/private-write denial.")
}
