package attachments

import (
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"github.com/danielgtaylor/huma/v2"
	"time"
)

type AssetKind string

const (
	ImageAsset AssetKind = "image"
	FileAsset  AssetKind = "file"
)

type AssetState string

const (
	PrivateDraft   AssetState = "draft"
	PublishedAsset AssetState = "published"
	ExpiredAsset   AssetState = "expired"
)

type PublicationMode string

const (
	DraftPublication PublicationMode = "draft"
	IssuePublication PublicationMode = "issue"
)
const MaximumAssetBytes int64 = 100 * 1024 * 1024

// Byte counts use decimal strings across REST/MCP and strict TypeScript.
// This same bound covers size, offsets and snapshot limits without float coercion.
type ByteCount int64

const byteCountPattern = `^(0|[1-9][0-9]{0,7}|10[0-3][0-9]{6}|104[0-7][0-9]{5}|1048[0-4][0-9]{4}|10485[0-6][0-9]{3}|104857[0-5][0-9]{2}|104857600)$`

func (b ByteCount) MarshalJSON() ([]byte, error) {
	if b < 0 || int64(b) > MaximumAssetBytes {
		return nil, errors.New("byte count is outside the supported bound")
	}
	return command.InitialRevision(b).MarshalJSON()
}
func (b *ByteCount) UnmarshalJSON(data []byte) error {
	var value command.InitialRevision
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	if int64(value) > MaximumAssetBytes {
		return errors.New("byte count is outside the supported bound")
	}
	*b = ByteCount(value)
	return nil
}
func (ByteCount) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Pattern: byteCountPattern, MaxLength: new(9)}
}

type AssetMetadata struct {
	Kind        AssetKind       `json:"kind" enum:"image,file"`
	Filename    string          `json:"filename" minLength:"1" maxLength:"255"`
	Description string          `json:"description" maxLength:"200"`
	MIMEType    string          `json:"mimeType" enum:"image/png,image/jpeg,image/webp,application/octet-stream,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`
	Publication PublicationMode `json:"publication" enum:"draft,issue"`
}
type AssetView struct {
	ID            command.AssetID          `json:"id"`
	IssueID       command.IssueID          `json:"issueId"`
	IssueRevision command.Revision         `json:"issueRevision"`
	Kind          AssetKind                `json:"kind" enum:"image,file"`
	Filename      string                   `json:"filename" minLength:"1" maxLength:"255"`
	Description   string                   `json:"description" maxLength:"200"`
	MIMEType      string                   `json:"mimeType" enum:"image/png,image/jpeg,image/webp,application/octet-stream,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`
	ByteSize      ByteCount                `json:"byteSize"`
	Uploader      command.IssueUserSummary `json:"uploader"`
	State         AssetState               `json:"state" enum:"draft,published"`
	InPanel       bool                     `json:"inPanel"`
	UploadedAt    time.Time                `json:"uploadedAt" format:"date-time"`
	ExpiresAt     *time.Time               `json:"expiresAt" nullable:"true" format:"date-time"`
}
type AssetUploadInput struct {
	IssueID        command.IssueID
	Metadata       AssetMetadata
	Data           []byte
	RetryReference string
}
type AssetUploadToolInput struct {
	IssueID        command.IssueID `json:"issueId"`
	Metadata       AssetMetadata   `json:"metadata"`
	DataBase64     string          `json:"dataBase64" minLength:"4" maxLength:"13981016" contentEncoding:"base64"`
	RetryReference string          `json:"retryReference" format:"uuid"`
}
type AssetGetInput struct {
	AssetID command.AssetID `json:"assetId"`
}
type AssetListInput struct {
	IssueID          command.IssueID     `json:"issueId"`
	IncludeOwnDrafts bool                `json:"includeOwnDrafts,omitempty"`
	Page             command.PageRequest `json:"page,omitempty"`
}
type AssetDetachInput struct {
	AssetID               command.AssetID  `json:"assetId"`
	ExpectedIssueRevision command.Revision `json:"expectedIssueRevision"`
	RetryReference        string           `json:"retryReference" format:"uuid"`
}
type AssetDownloadInput struct {
	AssetID command.AssetID `json:"assetId"`
	Offset  ByteCount       `json:"offset"`
	Count   ByteCount       `json:"count"`
}
type AssetChunk struct {
	Asset      AssetView `json:"asset"`
	Offset     ByteCount `json:"offset"`
	DataBase64 string    `json:"dataBase64" maxLength:"1398104" contentEncoding:"base64"`
	Terminal   bool      `json:"terminal"`
}

type UploadState string

const (
	Uploading       UploadState = "uploading"
	UploadReady     UploadState = "ready"
	UploadFailed    UploadState = "failed"
	UploadCommitted UploadState = "committed"
	UploadCanceled  UploadState = "canceled"
	UploadExpired   UploadState = "expired"
)

type UploadSessionView struct {
	SessionID     command.UploadSessionID `json:"sessionId"`
	AssetID       command.AssetID         `json:"assetId"`
	IssueID       command.IssueID         `json:"issueId"`
	State         UploadState             `json:"state" enum:"uploading,ready,failed,committed,canceled,expired"`
	Metadata      AssetMetadata           `json:"metadata"`
	ExpectedBytes ByteCount               `json:"expectedBytes"`
	MaximumBytes  ByteCount               `json:"maximumBytes"`
	ReceivedBytes ByteCount               `json:"receivedBytes"`
	ChunkBytes    ByteCount               `json:"chunkBytes"`
	ExpiresAt     time.Time               `json:"expiresAt" format:"date-time"`
}
type StartUploadFields struct {
	Metadata      AssetMetadata `json:"metadata"`
	ExpectedBytes ByteCount     `json:"expectedBytes"`
	Checksum      string        `json:"checksum" pattern:"^[0-9a-f]{64}$"`
}
type StartUploadInput struct {
	IssueID command.IssueID `json:"issueId"`
	StartUploadFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type GetUploadInput struct {
	SessionID command.UploadSessionID `json:"sessionId"`
}
type AppendUploadFields struct {
	Offset     ByteCount `json:"offset"`
	DataBase64 string    `json:"dataBase64" minLength:"4" maxLength:"1398104" contentEncoding:"base64"`
}
type AppendUploadInput struct {
	SessionID command.UploadSessionID `json:"sessionId"`
	AppendUploadFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type FinalizeUploadInput struct {
	SessionID      command.UploadSessionID `json:"sessionId"`
	RetryReference string                  `json:"retryReference" format:"uuid"`
}
type CancelUploadInput struct {
	SessionID      command.UploadSessionID `json:"sessionId"`
	RetryReference string                  `json:"retryReference" format:"uuid"`
}
