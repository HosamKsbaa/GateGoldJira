package comments

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type CommentBody struct {
	AttachmentIDs  []command.AssetID   `json:"attachmentIds,omitempty" maxItems:"20" uniqueItems:"true"`
	HTML           string              `json:"html" maxLength:"65536"`
	MentionUserIDs []command.UserID    `json:"mentionUserIds" nullable:"false" uniqueItems:"true"`
	PictureIDs     []command.PictureID `json:"pictureIds" nullable:"false" maxItems:"5" uniqueItems:"true"`
}
type MentionView struct {
	UserID       command.UserID `json:"userId"`
	DisplayLabel string         `json:"displayLabel" minLength:"1" maxLength:"100"`
}
type CommentView struct {
	AttachmentIDs     []command.AssetID        `json:"attachmentIds,omitempty" maxItems:"20" uniqueItems:"true"`
	ID                command.CommentID        `json:"id"`
	IssueID           command.IssueID          `json:"issueId"`
	Author            command.IssueUserSummary `json:"author"`
	SafeHTML          string                   `json:"safeHtml" maxLength:"65536"`
	PlainText         string                   `json:"plainText" maxLength:"10000"`
	Mentions          []MentionView            `json:"mentions" nullable:"false"`
	PictureIDs        []command.PictureID      `json:"pictureIds" nullable:"false" maxItems:"5" uniqueItems:"true"`
	Revision          command.Revision         `json:"revision"`
	CreatedAt         time.Time                `json:"createdAt"`
	EditedAt          *time.Time               `json:"editedAt" nullable:"true"`
	SanitationNotices []string                 `json:"sanitationNotices" nullable:"false" maxItems:"20"`
	CanEdit           bool                     `json:"canEdit"`
}
type CommentVersionView struct {
	AttachmentIDs []command.AssetID   `json:"attachmentIds,omitempty" maxItems:"20" uniqueItems:"true"`
	CommentID     command.CommentID   `json:"commentId"`
	Revision      command.Revision    `json:"revision"`
	SafeHTML      string              `json:"safeHtml" maxLength:"65536"`
	PlainText     string              `json:"plainText" maxLength:"10000"`
	PictureIDs    []command.PictureID `json:"pictureIds" nullable:"false" maxItems:"5" uniqueItems:"true"`
	CreatedAt     time.Time           `json:"createdAt"`
}
type CreateCommentFields struct {
	Body Body `json:"body"`
}
type CreateInput struct {
	IssueID        command.IssueID `json:"issueId"`
	Body           Body            `json:"body"`
	RetryReference string          `json:"retryReference" format:"uuid"`
}
type UpdateCommentFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Body             Body             `json:"body"`
}
type UpdateInput struct {
	CommentID        command.CommentID `json:"commentId"`
	ExpectedRevision command.Revision  `json:"expectedRevision"`
	Body             Body              `json:"body"`
	RetryReference   string            `json:"retryReference" format:"uuid"`
}
type ListInput struct {
	IssueID command.IssueID     `json:"issueId"`
	Page    command.PageRequest `json:"page,omitempty"`
}
type ListVersionsInput struct {
	CommentID command.CommentID   `json:"commentId"`
	Page      command.PageRequest `json:"page,omitempty"`
}

type Body = CommentBody
type VersionView = CommentVersionView
type CreateFields = CreateCommentFields
type UpdateFields = UpdateCommentFields
