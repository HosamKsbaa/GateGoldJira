package attachments

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/notifications"
	"strings"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type Service struct {
	runner       command.Runner
	cursors      *command.CursorSigner
	store        objectstore.Store
	maximumBytes int64
}

func New(runner command.Runner, cursors *command.CursorSigner, store objectstore.Store) *Service {
	return &Service{runner: runner, cursors: cursors, store: store, maximumBytes: objectstore.MaximumSize}
}
func validation(field, message string) error {
	return &command.Failure{
		Code:        command.Validation,
		Message:     message,
		FieldErrors: []command.FieldError{{Field: field, Message: message}},
		NextAction:  command.ReviewFields,
	}
}
func unavailable() error {
	return &command.Failure{
		Code:        command.Unavailable,
		Message:     "The attachment or issue is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func busy() error {
	return &command.Failure{
		Code:        command.Busy,
		Message:     "The attachment transfer could not be confirmed. Retry with the original reference.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.RetrySameReference,
		Retryable:   true,
	}
}
func issueScopes(issue command.IssueID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.AttachmentsResolveIssue(ctx, issue.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func attachmentScopes(id command.AttachmentID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.AttachmentsResolveAttachment(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func normalizeMetadata(in AttachmentUploadMetadata) (AttachmentUploadMetadata, error) {
	in.Filename = strings.TrimSpace(in.Filename)
	if command.ValidateText(in.Filename, 1, 255) != nil || strings.ContainsAny(in.Filename, "/\\\r\n\x00") {
		return in, validation("filename", "Use a filename of 1–255 characters without path separators or line breaks.")
	}
	if !supportedType(in.MIMEType) || !matchingExtension(in.Filename, in.MIMEType) {
		return in, validation("mimeType", "Choose a PDF, UTF-8 TXT/CSV, DOCX or XLSX with the matching filename extension.")
	}
	return in, nil
}
func validateView(v AttachmentView) error {
	if v.ID.UUID == uuid.Nil || v.IssueID.UUID == uuid.Nil || v.Uploader.ID.UUID == uuid.Nil || v.ByteSize < 1 || int64(v.ByteSize) > objectstore.MaximumSize || v.UploadedAt.IsZero() {
		return errors.New("invalid attachment result")
	}
	_, err := normalizeMetadata(AttachmentUploadMetadata{v.Filename, v.MIMEType})
	return err
}
func attachmentView(row dbgen.AttachmentsViewRow) AttachmentView {
	return AttachmentView{
		ID:       command.AttachmentID{UUID: row.ID},
		IssueID:  command.IssueID{UUID: row.IssueID},
		Filename: row.Filename,
		MIMEType: row.MimeType,
		ByteSize: int32(row.ByteSize),
		Uploader: command.IssueUserSummary{
			ID:          command.UserID{UUID: row.UploadedBy},
			DisplayName: row.DisplayName,
		},
		UploadedAt: row.UploadedAt.Time.UTC(),
		Attached:   row.Attached,
	}
}
func (s *Service) Get(ctx context.Context, actor command.Actor, id command.AttachmentID) (AttachmentView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, attachmentScopes(id, false), func(ctx context.Context, m *command.Mutation) (AttachmentView, error) {
		row, err := m.Queries.AttachmentsView(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return AttachmentView{}, unavailable()
		}
		if err != nil {
			return AttachmentView{}, err
		}
		if row.ByteSize > objectstore.MaximumSize {
			return AttachmentView{}, validation("attachment", "Use the unified asset operations for files larger than 10 MiB.")
		}
		return attachmentView(row), nil
	})
}

type pageFilters struct {
	IssueID command.IssueID `json:"issueId"`
}
type attachmentPosition struct {
	UploadedAt time.Time `json:"uploadedAt"`
	ID         uuid.UUID `json:"id"`
}

func (s *Service) List(ctx context.Context, actor command.Actor, in ListInput) (command.Page[AttachmentView], error) {
	empty := command.Page[AttachmentView]{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListAttachments, actor.UserID, "uploaded_at,id", pageFilters{in.IssueID})
	if err != nil {
		return empty, err
	}
	position := attachmentPosition{}
	if in.Page.Cursor != nil {
		position, err = command.ReadCursor[attachmentPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(in.IssueID, false), func(ctx context.Context, m *command.Mutation) (command.Page[AttachmentView], error) {
		fits, err := m.Queries.AssetsLegacyIssueFits(ctx, in.IssueID.UUID)
		if err != nil {
			return empty, err
		}
		if !fits {
			return empty, validation("attachments", "This issue contains larger files. Use the unified asset list and bounded download operations.")
		}
		rows, err := m.Queries.AttachmentsList(ctx, dbgen.AttachmentsListParams{
			IssueID:   in.IssueID.UUID,
			HasCursor: in.Page.Cursor != nil,
			AfterTime: pgtype.Timestamptz{Time: position.UploadedAt, Valid: true},
			AfterID:   position.ID,
			PageSize:  int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.AttachmentsCount(ctx, in.IssueID.UUID)
		if err != nil {
			return empty, err
		}
		items := []AttachmentView{}
		for _, row := range rows {
			items = append(items, attachmentView(dbgen.AttachmentsViewRow(row)))
		}
		return command.BuildPage(s.cursors, scope, items, size, int(count), false, func(v AttachmentView) attachmentPosition { return attachmentPosition{v.UploadedAt, v.ID.UUID} })
	})
}

type detachCommand struct {
	AttachmentID          command.AttachmentID `json:"attachmentId"`
	ExpectedIssueRevision command.Revision     `json:"expectedIssueRevision"`
}

func (s *Service) Detach(ctx context.Context, actor command.Actor, in DetachInput) (command.SaveOutcome[AttachmentView], error) {
	if in.ExpectedIssueRevision < 1 {
		return command.SaveOutcome[AttachmentView]{}, validation("expectedIssueRevision", "Read the current issue revision before detaching an attachment.")
	}
	canonical := detachCommand{in.AttachmentID, in.ExpectedIssueRevision}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.DetachAttachment,
		RetryReference:  in.RetryReference,
		ResolveProjects: attachmentScopes(in.AttachmentID, true),
	}
	return command.Save(ctx, s.runner, request, canonical, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.AttachmentsView(ctx, in.AttachmentID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, _ detachCommand) (command.Change[AttachmentView], error) {
		row, err := m.Queries.AttachmentsView(ctx, in.AttachmentID.UUID)
		if err != nil {
			return command.Change[AttachmentView]{}, err
		}
		revision, err := m.Queries.AttachmentsLockIssue(ctx, row.IssueID)
		if err != nil {
			return command.Change[AttachmentView]{}, err
		}
		if command.Revision(revision) != in.ExpectedIssueRevision {
			return command.Change[AttachmentView]{}, &command.Failure{
				Code:        command.Conflict,
				Message:     "The issue changed. Reload its current attachments before detaching.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReloadCurrentState,
			}
		}
		if !row.Attached {
			return command.Change[AttachmentView]{Result: attachmentView(row), HTTPStatus: 200}, nil
		}
		if _, err = m.Queries.AttachmentsDetach(ctx, row.ID); err != nil {
			return command.Change[AttachmentView]{}, err
		}
		if err = m.Queries.AttachmentsAdvanceIssue(ctx, row.IssueID); err != nil {
			return command.Change[AttachmentView]{}, err
		}
		project, issue := command.ProjectID{UUID: row.ProjectID}, command.IssueID{UUID: row.IssueID}
		before, after := "true", "false"
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.DetachAttachment,
			ResourceKind: activity.AttachmentResource,
			ResourceID:   row.ID,
			ProjectID:    &project,
			IssueID:      &issue,
			Changes: []activity.FieldChange{{
				Field:  "attached",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return command.Change[AttachmentView]{}, err
		}
		if err := notifications.WatchIssueChange(ctx, m, event.ID, issue, "Attachment removed from an issue you watch."); err != nil {
			return command.Change[AttachmentView]{}, err
		}
		row.Attached = false
		eventID := event.ID.String()
		return command.Change[AttachmentView]{Result: attachmentView(row), HTTPStatus: 200, EventID: &eventID}, nil
	}, validateView)
}

func (s *Service) WithMaximumBytes(maximum int64) *Service {
	if maximum >= 1 && maximum <= MaximumAssetBytes {
		s.maximumBytes = maximum
	}
	return s
}
