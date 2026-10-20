package parity

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"

	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/tests/testapp"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func TestDiscussionMultipartBase64ReplayAuthorAndProtectedDownloads(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin := reference(t, r, r.Admin)
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
		Key:            "CHAT",
		Name:           "Discussion",
		RetryReference: uuid.NewString(),
	})
	if !project.OK {
		t.Fatal("project")
	}
	projectID := project.Data.Result.ID
	for i, user := range []command.UserID{r.Member, r.Viewer} {
		role := command.Member
		if i == 1 {
			role = command.Viewer
		}
		saved := call[identity.SetMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.SetMembership, identity.SetMembershipInput{
			ProjectID:        projectID,
			UserID:           user,
			ExpectedRevision: 0,
			Role:             role,
			RetryReference:   uuid.NewString(),
		})
		if !saved.OK {
			t.Fatal("membership")
		}
	}
	member, viewer := reference(t, r, r.Member), reference(t, r, r.Viewer)
	work := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, member, command.CreateIssue, issues.CreateInput{
		ProjectID:         projectID,
		CreateIssueFields: issues.CreateIssueFields{Title: "Arabic نقاش"},
		RetryReference:    uuid.NewString(),
	})
	if !work.OK {
		t.Fatal("issue")
	}
	issueID := work.Data.Result.Summary.ID
	content := testenv.PNG(t)
	referenceID := uuid.NewString()
	metadata := pictures.UploadMetadata{
		Filename:    "picture.png",
		Description: "صورة عربية",
		MIMEType:    "image/png",
		Publication: pictures.CommentDraft,
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	encoded, _ := json.Marshal(metadata)
	if err := writer.WriteField("metadata", string(encoded)); err != nil {
		t.Fatal(err)
	}
	file, err := writer.CreateFormFile("file", metadata.Filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest("POST", r.URL+"/api/v1/issues/"+issueID.String()+"/pictures", &body)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Authorization", "Bearer "+r.Token(t, r.Member, command.REST))
	request.Header.Set("Idempotency-Key", referenceID)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	var photo command.Saved[pictures.PictureView]
	if response.StatusCode != 201 || json.NewDecoder(response.Body).Decode(&photo) != nil {
		response.Body.Close()
		t.Fatal("multipart upload", response.StatusCode)
	}
	response.Body.Close()
	replay := call[pictures.UploadToolInput, command.Saved[pictures.PictureView], httpapi.FailureBody](t, member, command.UploadPicture, pictures.UploadToolInput{
		IssueID: issueID,
		Upload: pictures.Base64Upload{
			UploadMetadata: metadata,
			DataBase64:     base64.StdEncoding.EncodeToString(content),
		},
		RetryReference: referenceID,
	})
	if !replay.OK || !replay.Data.Receipt.Replayed || replay.Data.Result.ID != photo.Result.ID || *replay.Data.Receipt.EventID != *photo.Receipt.EventID {
		t.Fatal("base64/multipart replay diverged")
	}
	forbidden := call[pictures.GetInput, pictures.PictureView, httpapi.FailureBody](t, viewer, command.GetPicture, pictures.GetInput{PictureID: photo.Result.ID})
	if forbidden.OK || forbidden.Error.Error.Code != command.Unavailable {
		t.Fatal("draft metadata exposed")
	}

	listed := call[pictures.ListInput, command.Page[pictures.PictureView], httpapi.FailureBody](t, member, command.ListPictures, pictures.ListInput{IssueID: issueID, IncludeOwnDrafts: true})
	if !listed.OK || len(listed.Data.Items) != 1 {
		t.Fatal("own draft listing")
	}
	hidden := call[pictures.ListInput, command.Page[pictures.PictureView], httpapi.FailureBody](t, viewer, command.ListPictures, pictures.ListInput{IssueID: issueID, IncludeOwnDrafts: true})
	if !hidden.OK || len(hidden.Data.Items) != 0 {
		t.Fatal("draft count leaked")
	}
	malformed := call[pictures.UploadToolInput, command.Saved[pictures.PictureView], httpapi.FailureBody](t, member, command.UploadPicture, pictures.UploadToolInput{
		IssueID: issueID,
		Upload: pictures.Base64Upload{
			UploadMetadata: metadata,
			DataBase64:     "AAAA\n",
		},
		RetryReference: uuid.NewString(),
	})
	if malformed.OK || malformed.Error.Error.Code != command.Validation {
		t.Fatal("noncanonical base64 accepted")
	}
	input := comments.CreateInput{
		IssueID: issueID,
		Body: comments.Body{
			HTML:           `<p dir="rtl">مرحبا <strong>عمل</strong><img data-picture-id="` + photo.Result.ID.String() + `"></p>`,
			MentionUserIDs: []command.UserID{},
			PictureIDs:     []command.PictureID{photo.Result.ID},
		},
		RetryReference: uuid.NewString(),
	}
	saved := call[comments.CreateInput, command.Saved[comments.CommentView], comments.CommentFailureBody](t, member, command.CreateComment, input)
	if !saved.OK || saved.Data.Result.Author.ID != r.Member || !strings.Contains(saved.Data.Result.PlainText, "صورة عربية") {
		t.Fatal("picture comment not saved")
	}

	published := call[pictures.ListInput, command.Page[pictures.PictureView], httpapi.FailureBody](t, viewer, command.ListPictures, pictures.ListInput{IssueID: issueID})
	if !published.OK || len(published.Data.Items) != 1 || !published.Data.Items[0].InGallery || published.Data.Items[0].ID != photo.Result.ID {
		t.Fatal("posted picture missing from shared issue attachments")
	}
	var publishedRevision int64
	if err := r.Pool.QueryRow(context.Background(), "SELECT revision FROM issues WHERE id=$1", issueID.UUID).Scan(&publishedRevision); err != nil || publishedRevision != int64(work.Data.Result.Summary.Revision)+1 {
		t.Fatal("picture publication must advance the issue attachment revision")
	}

	versions := call[comments.ListVersionsInput, command.Page[comments.VersionView], comments.CommentFailureBody](t, viewer, command.ListCommentVersions, comments.ListVersionsInput{CommentID: saved.Data.Result.ID})
	if !versions.OK || len(versions.Data.Items) != 1 {
		t.Fatal("retained comment versions")
	}
	thread := call[comments.ListInput, command.Page[comments.CommentView], comments.CommentFailureBody](t, viewer, command.ListComments, comments.ListInput{IssueID: issueID})
	if !thread.OK || len(thread.Data.Items) != 1 {
		t.Fatal("discussion list")
	}
	var issueRevision int64
	if err := r.Pool.QueryRow(context.Background(), "SELECT revision FROM issues WHERE id=$1", issueID.UUID).Scan(&issueRevision); err != nil {
		t.Fatal(err)
	}
	detached := call[pictures.DetachInput, command.Saved[pictures.PictureView], httpapi.FailureBody](t, member, command.DetachGalleryPicture, pictures.DetachInput{
		PictureID:             photo.Result.ID,
		ExpectedIssueRevision: command.Revision(issueRevision),
		RetryReference:        uuid.NewString(),
	})
	if !detached.OK || detached.Data.Result.InGallery {
		t.Fatal("published comment picture did not detach")
	}
	r.Restart(t)
	again, status := rest[comments.CreateFields, command.Saved[comments.CommentView]](t, r, r.Member, "POST", "/issues/"+issueID.String()+"/comments", input.RetryReference, comments.CreateFields{Body: input.Body})
	if status != 201 || !again.Receipt.Replayed || *again.Receipt.EventID != *saved.Data.Receipt.EventID {
		t.Fatal("comment retry divergence")
	}
	updated := call[comments.UpdateInput, command.Saved[comments.CommentView], comments.CommentFailureBody](t, member, command.UpdateComment, comments.UpdateInput{
		CommentID:        saved.Data.Result.ID,
		ExpectedRevision: 1,
		Body:             input.Body,
		RetryReference:   uuid.NewString(),
	})
	if !updated.OK {
		t.Fatal("retained picture reference could not be edited")
	}
	removed := call[pictures.ListInput, command.Page[pictures.PictureView], httpapi.FailureBody](t, viewer, command.ListPictures, pictures.ListInput{IssueID: issueID})
	if !removed.OK || len(removed.Data.Items) != 0 {
		t.Fatal("editing a comment reattached an explicitly removed picture")
	}

	downloaded := call[pictures.GetInput, pictures.PictureDownload, httpapi.FailureBody](t, viewer, command.DownloadPicture, pictures.GetInput{PictureID: photo.Result.ID})
	if !downloaded.OK || downloaded.Data.DataBase64 != base64.StdEncoding.EncodeToString(content) {
		t.Fatal("published bytes lost across restart")
	}
	request, err = http.NewRequest("GET", r.URL+"/api/v1/pictures/"+photo.Result.ID.String()+"/content", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+r.Token(t, r.Viewer, command.REST))
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || !bytes.Equal(actual, content) || response.Header.Get("Cache-Control") != "private, no-store" || response.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("binary parity or private headers")
	}
	unauthorized := call[comments.UpdateInput, command.Saved[comments.CommentView], comments.CommentFailureBody](t, admin, command.UpdateComment, comments.UpdateInput{
		CommentID:        saved.Data.Result.ID,
		ExpectedRevision: 1,
		Body: comments.Body{
			HTML:           "changed",
			MentionUserIDs: []command.UserID{},
			PictureIDs:     []command.PictureID{},
		},
		RetryReference: uuid.NewString(),
	})
	if unauthorized.OK || unauthorized.Error.Error.Code != command.Forbidden {
		t.Fatal("Admin edited another author")
	}
	if _, err := r.Pool.Exec(context.Background(), "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", projectID.UUID, r.Viewer.UUID); err != nil {
		t.Fatal(err)
	}
	request, err = http.NewRequest("GET", r.URL+"/api/v1/pictures/"+photo.Result.ID.String()+"/content", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+r.Token(t, r.Viewer, command.REST))
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 404 {
		t.Fatal("copied download survived revocation")
	}
}

func TestMaximumPictureTransportAndExplicitReferenceLimits(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin := reference(t, r, r.Admin)
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
		Key:            "BIG",
		Name:           "Maximum transfer",
		RetryReference: uuid.NewString(),
	})
	if !project.OK {
		t.Fatal("project")
	}
	work := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, admin, command.CreateIssue, issues.CreateInput{
		ProjectID:         project.Data.Result.ID,
		CreateIssueFields: issues.CreateIssueFields{Title: "Bounded transfer"},
		RetryReference:    uuid.NewString(),
	})
	if !work.OK {
		t.Fatal("issue")
	}
	data := testenv.PNGSize(t, 10*1024*1024)
	in := pictures.UploadToolInput{
		IssueID: work.Data.Result.Summary.ID,
		Upload: pictures.Base64Upload{
			UploadMetadata: pictures.UploadMetadata{
				Filename:    "maximum.png",
				Description: "Maximum picture",
				MIMEType:    "image/png",
				Publication: pictures.Gallery,
			},
			DataBase64: base64.StdEncoding.EncodeToString(data),
		},
		RetryReference: uuid.NewString(),
	}
	photo := call[pictures.UploadToolInput, command.Saved[pictures.PictureView], httpapi.FailureBody](t, admin, command.UploadPicture, in)
	if !photo.OK || photo.Data.Result.ByteSize != int32(len(data)) {
		t.Fatal("maximum picture rejected")
	}
	downloaded := call[pictures.GetInput, pictures.PictureDownload, httpapi.FailureBody](t, admin, command.DownloadPicture, pictures.GetInput{PictureID: photo.Data.Result.ID})
	if !downloaded.OK || downloaded.Data.DataBase64 != in.Upload.DataBase64 {
		t.Fatal("maximum output truncated")
	}
	in.Upload.DataBase64 = base64.StdEncoding.EncodeToString(append(data, 0))
	in.RetryReference = uuid.NewString()
	tooLarge := call[pictures.UploadToolInput, command.Saved[pictures.PictureView], httpapi.FailureBody](t, admin, command.UploadPicture, in)
	if tooLarge.OK || tooLarge.Error.Error.Code != command.Validation {
		t.Fatal("decoded maximum exceeded")
	}
	invalid := call[comments.CreateInput, command.Saved[comments.CommentView], comments.CommentFailureBody](t, admin, command.CreateComment, comments.CreateInput{
		IssueID: work.Data.Result.Summary.ID,
		Body: comments.Body{
			HTML:           "<p>Hidden reference</p>",
			MentionUserIDs: []command.UserID{},
			PictureIDs:     []command.PictureID{photo.Data.Result.ID},
		},
		RetryReference: uuid.NewString(),
	})
	if invalid.OK || invalid.Error.Error.Code != command.Validation {
		t.Fatal("extra explicit reference accepted")
	}
	request, err := http.NewRequest("POST", r.URL+"/api/v1/issues/"+work.Data.Result.Summary.ID.String()+"/pictures", strings.NewReader(strings.Repeat("x", httpapi.MaximumTransportBytes+1)))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+r.Token(t, r.Admin, command.REST))
	request.Header.Set("Content-Type", "multipart/form-data; boundary=test")
	request.Header.Set("Idempotency-Key", uuid.NewString())
	request.Header.Set("Expect", "100-continue")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal("oversized transport", err)
	}
	defer response.Body.Close()
	if response.StatusCode != 413 {
		t.Fatal("16 MiB envelope accepted", response.StatusCode)
	}
}
