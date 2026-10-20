package parity

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/google/uuid"
	"testing"
)

func matrixAssets(t *testing.T, m *catalogMatrix) {
	t.Helper()
	actor := m.runtime.Admin
	project := matrixSave[projects.CreateInput, projects.ProjectView, projects.ProjectFailureBody](t, m, actor, command.CreateProject, projects.CreateInput{
		Key:            "ASSETS",
		Name:           "Unified assets",
		RetryReference: uuid.NewString(),
	})
	issue := matrixSave[issues.CreateInput, issues.IssueView, issues.IssueFailureBody](t, m, actor, command.CreateIssue, issues.CreateInput{
		ProjectID:      project.ID,
		Title:          "مرفقات عربية",
		RetryReference: uuid.NewString(),
	})
	matrixRead[struct{}, attachments.AssetPolicy, httpapi.FailureBody](t, m, actor, command.GetAssetPolicy, struct{}{})
	data := []byte("وثيقة خاصة")
	checksum := sha256.Sum256(data)
	asset := matrixSave[attachments.AssetUploadToolInput, attachments.AssetView, httpapi.FailureBody](t, m, actor, command.UploadAsset, attachments.AssetUploadToolInput{
		IssueID: issue.Summary.ID,
		Metadata: attachments.AssetMetadata{
			Kind:        attachments.FileAsset,
			Filename:    "مرفق.txt",
			MIMEType:    "text/plain",
			Publication: attachments.IssuePublication,
		},
		DataBase64:     base64.StdEncoding.EncodeToString(data),
		RetryReference: uuid.NewString(),
	})
	matrixRead[attachments.AssetGetInput, attachments.AssetView, httpapi.FailureBody](t, m, actor, command.GetAsset, attachments.AssetGetInput{AssetID: asset.ID})
	matrixRead[attachments.AssetListInput, command.Page[attachments.AssetView], httpapi.FailureBody](t, m, actor, command.ListAssets, attachments.AssetListInput{IssueID: issue.Summary.ID})
	matrixRead[attachments.AssetDownloadInput, attachments.AssetChunk, httpapi.FailureBody](t, m, actor, command.DownloadAssetChunk, attachments.AssetDownloadInput{AssetID: asset.ID, Offset: 0, Count: 1024})
	matrixSave[attachments.AssetDetachInput, attachments.AssetView, httpapi.FailureBody](t, m, actor, command.DetachAsset, attachments.AssetDetachInput{
		AssetID:               asset.ID,
		ExpectedIssueRevision: asset.IssueRevision,
		RetryReference:        uuid.NewString(),
	})
	start := attachments.StartUploadInput{
		IssueID: issue.Summary.ID,
		StartUploadFields: attachments.StartUploadFields{
			Metadata: attachments.AssetMetadata{
				Kind:        attachments.FileAsset,
				Filename:    "مسودة.txt",
				MIMEType:    "text/plain",
				Publication: attachments.DraftPublication,
			},
			ExpectedBytes: attachments.ByteCount(len(data)),
			Checksum:      hex.EncodeToString(checksum[:]),
		},
		RetryReference: uuid.NewString(),
	}
	session := matrixSave[attachments.StartUploadInput, attachments.UploadSessionView, httpapi.FailureBody](t, m, actor, command.StartAssetUpload, start)
	matrixRead[attachments.GetUploadInput, attachments.UploadSessionView, httpapi.FailureBody](t, m, actor, command.GetAssetUpload, attachments.GetUploadInput{SessionID: session.SessionID})
	matrixSave[attachments.AppendUploadInput, attachments.UploadSessionView, httpapi.FailureBody](t, m, actor, command.AppendAssetChunk, attachments.AppendUploadInput{
		SessionID:          session.SessionID,
		AppendUploadFields: attachments.AppendUploadFields{DataBase64: base64.StdEncoding.EncodeToString(data)},
		RetryReference:     uuid.NewString(),
	})
	matrixSave[attachments.FinalizeUploadInput, attachments.AssetView, httpapi.FailureBody](t, m, actor, command.FinalizeAssetUpload, attachments.FinalizeUploadInput{
		SessionID:      session.SessionID,
		RetryReference: uuid.NewString(),
	})
	start.RetryReference = uuid.NewString()
	session = matrixSave[attachments.StartUploadInput, attachments.UploadSessionView, httpapi.FailureBody](t, m, actor, command.StartAssetUpload, start)
	matrixSave[attachments.CancelUploadInput, attachments.UploadSessionView, httpapi.FailureBody](t, m, actor, command.CancelAssetUpload, attachments.CancelUploadInput{
		SessionID:      session.SessionID,
		RetryReference: uuid.NewString(),
	})
}
func TestUnifiedAssetsUseConcreteTransportsAndRestartReplays(t *testing.T) {
	matrixAssets(t, newCatalogMatrix(t))
}
