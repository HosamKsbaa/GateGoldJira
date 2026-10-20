package pictures

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/features/notifications"
	"strings"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Service struct {
	assetStorage *attachments.Service
	runner       command.Runner
	cursors      *command.CursorSigner
	store        objectstore.Store
}

func New(runner command.Runner, cursors *command.CursorSigner, store objectstore.Store) *Service {
	return &Service{runner: runner, cursors: cursors, store: store, assetStorage: attachments.New(runner, cursors, store)}
}
func (s *Service) WithAssets(assets *attachments.Service) *Service {
	if assets != nil {
		s.assetStorage = assets
	}
	return s
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
		Message:     "The picture or issue is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func busy() error {
	return &command.Failure{
		Code:        command.Busy,
		Message:     "The picture transfer could not be confirmed. Retry with the original reference.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.RetrySameReference,
		Retryable:   true,
	}
}
func issueScopes(issue command.IssueID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.PicturesResolveIssue(ctx, issue.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func pictureScopes(picture command.PictureID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.PicturesResolvePicture(ctx, picture.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func normalizeMetadata(in UploadMetadata) (UploadMetadata, error) {
	in.Filename = strings.TrimSpace(in.Filename)
	in.Description = strings.TrimSpace(in.Description)
	if command.ValidateText(in.Filename, 1, 255) != nil || strings.ContainsAny(in.Filename, "/\\\r\n") {
		return in, validation("filename", "Use a filename of 1–255 characters without path separators or line breaks.")
	}
	if command.ValidateText(in.Description, 1, 200) != nil {
		return in, validation("description", "Enter a picture description of 1–200 characters.")
	}
	if in.MIMEType != "image/png" && in.MIMEType != "image/jpeg" && in.MIMEType != "image/webp" {
		return in, validation("mimeType", "Choose a PNG, JPEG or WebP picture.")
	}
	if in.Publication != CommentDraft && in.Publication != Gallery {
		return in, validation("publication", "Choose a comment draft or gallery publication.")
	}
	return in, nil
}
func validateView(v PictureView) error {
	if v.ID.UUID == uuid.Nil || v.IssueID.UUID == uuid.Nil || v.Uploader.ID.UUID == uuid.Nil || v.ByteSize < 1 || int64(v.ByteSize) > objectstore.MaximumSize || v.UploadedAt.IsZero() || (v.State != Draft && v.State != Published) || (v.State == Draft) != (v.ExpiresAt != nil) || v.State == Draft && v.InGallery {
		return errors.New("invalid picture result")
	}
	_, err := normalizeMetadata(UploadMetadata{v.Filename, v.Description, v.MIMEType, CommentDraft})
	return err
}
func pictureView(row dbgen.PicturesViewRow) PictureView {
	v := PictureView{
		ID:          command.PictureID{UUID: row.ID},
		IssueID:     command.IssueID{UUID: row.IssueID},
		Filename:    row.Filename,
		Description: row.Description,
		MIMEType:    row.MimeType,
		ByteSize:    int32(row.ByteSize),
		Uploader: command.IssueUserSummary{
			ID:          command.UserID{UUID: row.UploadedBy},
			DisplayName: row.DisplayName,
		},
		UploadedAt: row.UploadedAt.Time.UTC(),
		State:      State(row.State),
		InGallery:  row.InGallery,
	}
	if v.State == Draft {
		expires := row.ExpiresAt.Time.UTC()
		v.ExpiresAt = &expires
	}
	return v
}

func (s *Service) Get(ctx context.Context, actor command.Actor, id command.PictureID) (PictureView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, pictureScopes(id, false), func(ctx context.Context, m *command.Mutation) (PictureView, error) {
		row, err := m.Queries.PicturesVisible(ctx, dbgen.PicturesVisibleParams{ID: id.UUID, CallerID: actor.UserID.UUID})
		if errors.Is(err, pgx.ErrNoRows) {
			return PictureView{}, unavailable()
		}
		if err != nil {
			return PictureView{}, err
		}
		return pictureView(dbgen.PicturesViewRow(row)), nil
	})
}

type pageFilters struct {
	IssueID          command.IssueID `json:"issueId"`
	IncludeOwnDrafts bool            `json:"includeOwnDrafts"`
}
type picturePosition struct {
	UploadedAt time.Time `json:"uploadedAt"`
	ID         uuid.UUID `json:"id"`
}

func (s *Service) List(ctx context.Context, actor command.Actor, in ListInput) (command.Page[PictureView], error) {
	empty := command.Page[PictureView]{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListPictures, actor.UserID, "uploaded_at,id", pageFilters{in.IssueID, in.IncludeOwnDrafts})
	if err != nil {
		return empty, err
	}
	position := picturePosition{}
	if in.Page.Cursor != nil {
		position, err = command.ReadCursor[picturePosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(in.IssueID, false), func(ctx context.Context, m *command.Mutation) (command.Page[PictureView], error) {
		rows, err := m.Queries.PicturesList(ctx, dbgen.PicturesListParams{
			IssueID:       in.IssueID.UUID,
			IncludeDrafts: in.IncludeOwnDrafts,
			CallerID:      actor.UserID.UUID,
			HasCursor:     in.Page.Cursor != nil,
			AfterTime:     timestamp(position.UploadedAt),
			AfterID:       position.ID,
			PageSize:      int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.PicturesCount(ctx, dbgen.PicturesCountParams{
			IssueID:       in.IssueID.UUID,
			IncludeDrafts: in.IncludeOwnDrafts,
			CallerID:      actor.UserID.UUID,
		})
		if err != nil {
			return empty, err
		}
		items := []PictureView{}
		for _, row := range rows {
			items = append(items, pictureView(dbgen.PicturesViewRow(row)))
		}
		return command.BuildPage(s.cursors, scope, items, size, int(count), false, func(v PictureView) picturePosition { return picturePosition{v.UploadedAt, v.ID.UUID} })
	})
}
func (s *Service) Detach(ctx context.Context, actor command.Actor, in DetachInput) (command.SaveOutcome[PictureView], error) {
	if in.ExpectedIssueRevision < 1 {
		return command.SaveOutcome[PictureView]{}, validation("expectedIssueRevision", "Read the current issue revision before detaching a picture.")
	}
	canonical := struct {
		PictureID             command.PictureID `json:"pictureId"`
		ExpectedIssueRevision command.Revision  `json:"expectedIssueRevision"`
	}{in.PictureID, in.ExpectedIssueRevision}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.DetachGalleryPicture,
		RetryReference:  in.RetryReference,
		ResolveProjects: pictureScopes(in.PictureID, true),
	}
	return command.Save(ctx, s.runner, request, canonical, func(ctx context.Context, m *command.Mutation) error {
		row, err := m.Queries.PicturesView(ctx, in.PictureID.UUID)
		if err != nil {
			return err
		}
		if row.State != string(Published) {
			return unavailable()
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, _ struct {
		PictureID             command.PictureID `json:"pictureId"`
		ExpectedIssueRevision command.Revision  `json:"expectedIssueRevision"`
	}) (command.Change[PictureView], error) {
		row, err := m.Queries.PicturesView(ctx, in.PictureID.UUID)
		if err != nil {
			return command.Change[PictureView]{}, err
		}
		issue, err := m.Queries.PicturesResolveIssue(ctx, row.IssueID)
		if err != nil {
			return command.Change[PictureView]{}, err
		}
		if command.Revision(issue.Revision) != in.ExpectedIssueRevision {
			return command.Change[PictureView]{}, &command.Failure{
				Code:        command.Conflict,
				Message:     "The issue changed. Reload its current gallery before detaching.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReloadCurrentState,
			}
		}
		if !row.InGallery {
			return command.Change[PictureView]{Result: pictureView(row), HTTPStatus: 200}, nil
		}
		if _, err := m.Queries.PicturesDetach(ctx, row.ID); err != nil {
			return command.Change[PictureView]{}, err
		}
		if err := m.Queries.PicturesAdvanceIssue(ctx, row.IssueID); err != nil {
			return command.Change[PictureView]{}, err
		}
		row.InGallery = false
		project, issueID := command.ProjectID{UUID: row.ProjectID}, command.IssueID{UUID: row.IssueID}
		before, after := "true", "false"
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.DetachGalleryPicture,
			ResourceKind: activity.PictureResource,
			ResourceID:   row.ID,
			ProjectID:    &project,
			IssueID:      &issueID,
			Changes: []activity.FieldChange{{
				Field:  "inGallery",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return command.Change[PictureView]{}, err
		}
		if err := notifications.WatchIssueChange(ctx, m, event.ID, issueID, "Picture removed from an issue you watch."); err != nil {
			return command.Change[PictureView]{}, err
		}
		eventID := event.ID.String()
		return command.Change[PictureView]{Result: pictureView(row), HTTPStatus: 200, EventID: &eventID}, nil
	}, validateView)
}

func (s *Service) Assets() *attachments.Service { return s.assetStorage }
