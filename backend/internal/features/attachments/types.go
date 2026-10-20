package attachments

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type AttachmentView struct {
	ID         command.AttachmentID     `json:"id"`
	IssueID    command.IssueID          `json:"issueId"`
	Filename   string                   `json:"filename" minLength:"1" maxLength:"255"`
	MIMEType   string                   `json:"mimeType" enum:"application/octet-stream,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`
	ByteSize   int32                    `json:"byteSize" minimum:"1" maximum:"10485760"`
	Uploader   command.IssueUserSummary `json:"uploader"`
	UploadedAt time.Time                `json:"uploadedAt"`
	Attached   bool                     `json:"attached"`
}
type AttachmentUploadMetadata struct {
	Filename string `json:"filename" minLength:"1" maxLength:"255"`
	MIMEType string `json:"mimeType" enum:"application/octet-stream,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`
}
type UploadInput struct {
	IssueID        command.IssueID
	Metadata       AttachmentUploadMetadata
	Data           []byte
	RetryReference string
}
type Base64Upload struct {
	AttachmentUploadMetadata
	DataBase64 string `json:"dataBase64" minLength:"4" maxLength:"13981016" contentEncoding:"base64"`
}
type UploadToolInput struct {
	IssueID        command.IssueID `json:"issueId"`
	Upload         Base64Upload    `json:"upload"`
	RetryReference string          `json:"retryReference" format:"uuid"`
}
type GetInput struct {
	AttachmentID command.AttachmentID `json:"attachmentId"`
}
type ListInput struct {
	IssueID command.IssueID     `json:"issueId"`
	Page    command.PageRequest `json:"page,omitempty"`
}
type AttachmentDetachFields struct {
	ExpectedIssueRevision command.Revision `json:"expectedIssueRevision"`
}
type DetachInput struct {
	AttachmentID          command.AttachmentID `json:"attachmentId"`
	ExpectedIssueRevision command.Revision     `json:"expectedIssueRevision"`
	RetryReference        string               `json:"retryReference" format:"uuid"`
}
type AttachmentDownload struct {
	Attachment AttachmentView `json:"attachment"`
	DataBase64 string         `json:"dataBase64" minLength:"4" maxLength:"13981016" contentEncoding:"base64"`
}
