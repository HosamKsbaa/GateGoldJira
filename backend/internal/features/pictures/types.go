package pictures

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type State string

const (
	Draft     State = "draft"
	Published State = "published"
	Expired   State = "expired"
)

type Object struct {
	Key        string
	Generation int64
}
type Picture struct {
	ID              command.PictureID
	ProjectID       command.ProjectID
	IssueID         command.IssueID
	UploadedBy      command.UserID
	Filename        string
	Description     string
	MIMEType        string
	ByteSize        int64
	Checksum        string
	Staging         Object
	PublishedObject *Object
	State           State
	InGallery       bool
	UploadedAt      time.Time
	ExpiresAt       time.Time
	PublishedAt     *time.Time
}

// Public picture metadata never contains object coordinates or a signed URL.
type PictureView struct {
	IssueRevision *command.Revision        `json:"issueRevision,omitempty"`
	ID            command.PictureID        `json:"id"`
	IssueID       command.IssueID          `json:"issueId"`
	Filename      string                   `json:"filename" minLength:"1" maxLength:"255"`
	Description   string                   `json:"description" minLength:"1" maxLength:"200"`
	MIMEType      string                   `json:"mimeType" enum:"image/png,image/jpeg,image/webp"`
	ByteSize      int32                    `json:"byteSize" minimum:"1" maximum:"10485760"`
	Uploader      command.IssueUserSummary `json:"uploader"`
	UploadedAt    time.Time                `json:"uploadedAt"`
	State         State                    `json:"state" enum:"draft,published"`
	InGallery     bool                     `json:"inGallery"`
	ExpiresAt     *time.Time               `json:"expiresAt" nullable:"true"`
}
type Publication string

const (
	CommentDraft Publication = "comment_draft"
	Gallery      Publication = "gallery"
)

type UploadMetadata struct {
	Filename    string      `json:"filename" minLength:"1" maxLength:"255"`
	Description string      `json:"description" minLength:"1" maxLength:"200"`
	MIMEType    string      `json:"mimeType" enum:"image/png,image/jpeg,image/webp"`
	Publication Publication `json:"publication" enum:"comment_draft,gallery"`
}
type UploadInput struct {
	IssueID        command.IssueID
	Metadata       UploadMetadata
	Data           []byte
	RetryReference string
}
type Base64Upload struct {
	UploadMetadata
	DataBase64 string `json:"dataBase64" minLength:"4" maxLength:"13981016" contentEncoding:"base64"`
}
type UploadToolInput struct {
	IssueID        command.IssueID `json:"issueId"`
	Upload         Base64Upload    `json:"upload"`
	RetryReference string          `json:"retryReference" format:"uuid"`
}
type GetInput struct {
	PictureID command.PictureID `json:"pictureId"`
}
type ListInput struct {
	IssueID          command.IssueID     `json:"issueId"`
	Page             command.PageRequest `json:"page,omitempty"`
	IncludeOwnDrafts bool                `json:"includeOwnDrafts,omitempty"`
}
type DetachFields struct {
	ExpectedIssueRevision command.Revision `json:"expectedIssueRevision"`
}
type DetachInput struct {
	PictureID             command.PictureID `json:"pictureId"`
	ExpectedIssueRevision command.Revision  `json:"expectedIssueRevision"`
	RetryReference        string            `json:"retryReference" format:"uuid"`
}
type PictureDownload struct {
	Picture    PictureView `json:"picture"`
	DataBase64 string      `json:"dataBase64" minLength:"4" maxLength:"13981016" contentEncoding:"base64"`
}
