package comments

import (
	"context"
	"errors"
	"sort"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type Service struct {
	runner   command.Runner
	cursors  *command.CursorSigner
	pictures *pictures.Service
	assets   *attachments.Service
}

func New(runner command.Runner, cursors *command.CursorSigner, pictureService *pictures.Service) *Service {
	var assets *attachments.Service
	if pictureService != nil {
		assets = pictureService.Assets()
	}
	return &Service{runner: runner, cursors: cursors, pictures: pictureService, assets: assets}
}
func unavailable() error {
	return &command.Failure{
		Code:        command.Unavailable,
		Message:     "The comment or issue is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func forbidden() error {
	return &command.Failure{
		Code:        command.Forbidden,
		Message:     "Only the author with current write access can edit this comment.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func issueScopes(id command.IssueID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		r, err := m.Queries.CommentsResolveIssue(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: r.ProjectID}, Write: write}}, nil
	}
}
func commentScopes(id command.CommentID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		r, err := m.Queries.CommentsResolve(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: r.ProjectID}, Write: write}}, nil
	}
}
func validateView(v CommentView) error {
	if v.ID.UUID == uuid.Nil || v.IssueID.UUID == uuid.Nil || v.Author.ID.UUID == uuid.Nil || v.Revision < 1 || v.CreatedAt.IsZero() || len(v.SafeHTML) > 65536 || command.ValidateText(v.PlainText, 0, 10000) != nil || v.Mentions == nil || v.PictureIDs == nil || v.SanitationNotices == nil {
		return errors.New("invalid comment result")
	}
	return nil
}
func commentView(m *command.Mutation, row dbgen.CommentsViewRow) (CommentView, error) {
	mentions, err := database.DecodeJSON[[]MentionView](row.Mentions)
	if err != nil {
		return CommentView{}, err
	}
	ids := make([]command.PictureID, 0, len(row.PictureIds))
	for _, id := range row.PictureIds {
		ids = append(ids, command.PictureID{UUID: id})
	}
	permissions, err := m.ProjectPermissions(command.ProjectID{UUID: row.ProjectID})
	if err != nil {
		return CommentView{}, err
	}
	files := make([]command.AssetID, 0, len(row.AttachmentIds))
	for _, id := range row.AttachmentIds {
		files = append(files, command.AssetID{UUID: id})
	}
	view := CommentView{
		AttachmentIDs: files,
		ID:            command.CommentID{UUID: row.ID},
		IssueID:       command.IssueID{UUID: row.IssueID},
		Author: command.IssueUserSummary{
			ID:          command.UserID{UUID: row.AuthorID},
			DisplayName: row.DisplayName,
		},
		SafeHTML:          row.SafeHtml,
		PlainText:         row.PlainText,
		Mentions:          mentions,
		PictureIDs:        ids,
		Revision:          command.Revision(row.Revision),
		CreatedAt:         row.CreatedAt.Time.UTC(),
		SanitationNotices: []string{},
		CanEdit:           permissions.CanWrite && !permissions.Archived && row.AuthorID == m.Actor.UserID.UUID,
	}
	if row.EditedAt.Valid {
		value := row.EditedAt.Time.UTC()
		view.EditedAt = &value
	}
	return view, validateView(view)
}
func (s *Service) view(ctx context.Context, m *command.Mutation, id command.CommentID) (CommentView, error) {
	row, err := m.Queries.CommentsView(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return CommentView{}, unavailable()
	}
	if err != nil {
		return CommentView{}, err
	}
	return commentView(m, row)
}
func normalizeBody(body Body) (Body, error) {
	if body.MentionUserIDs == nil || body.PictureIDs == nil {
		return body, invalidBody("body", "Supply explicit mention and picture ID collections.")
	}
	body.MentionUserIDs = append([]command.UserID{}, body.MentionUserIDs...)
	body.PictureIDs = append([]command.PictureID{}, body.PictureIDs...)
	sort.Slice(body.MentionUserIDs, func(i, j int) bool { return body.MentionUserIDs[i].String() < body.MentionUserIDs[j].String() })
	sort.Slice(body.PictureIDs, func(i, j int) bool { return body.PictureIDs[i].String() < body.PictureIDs[j].String() })
	users := map[command.UserID]string{}
	photos := map[command.PictureID]string{}
	for _, id := range body.MentionUserIDs {
		users[id] = "Selected user"
	}
	for _, id := range body.PictureIDs {
		photos[id] = "Uploaded picture"
	}
	files := map[command.AssetID]string{}
	if body.AttachmentIDs != nil {
		body.AttachmentIDs = append([]command.AssetID(nil), body.AttachmentIDs...)
		sort.Slice(body.AttachmentIDs, func(i, j int) bool { return body.AttachmentIDs[i].String() < body.AttachmentIDs[j].String() })
	}
	for _, id := range body.AttachmentIDs {
		files[id] = "Selected file"
	}
	_, err := CanonicalizeWithFiles(body, users, photos, files, command.IssueID{})
	return body, err
}

// Preflight avoids publishing new objects or revalidating old mention eligibility
// on a completed retry. Save still locks the caller's reference and rechecks all
// current permissions/ownership. If retention races this hint, apply fails safe.
func retryReady[In any](ctx context.Context, m *command.Mutation, op command.Operation, reference string, args In) (bool, error) {
	id, err := uuid.Parse(reference)
	if err != nil || id == uuid.Nil {
		return false, invalidBody("retryReference", "Use a nonzero UUID retry reference.")
	}
	row, err := m.Queries.CommentsRetry(ctx, dbgen.CommentsRetryParams{ActorID: m.Actor.UserID.UUID, RetryReference: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	hash, err := command.CanonicalHash(op, args)
	if err != nil {
		return false, err
	}
	if row.Operation != string(op) || row.CanonicalInputHash != hash {
		return false, &command.Failure{
			Code:        command.RetryReferenceReused,
			Message:     "This reference belongs to different input.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.UseNewRetryReference,
		}
	}
	return row.Completed, nil
}
func saveVersion(ctx context.Context, m *command.Mutation, row dbgen.Comment, body Body, clean CanonicalBody, labels map[command.UserID]string) error {
	if err := m.Queries.CommentsInsertVersion(ctx, dbgen.CommentsInsertVersionParams{
		CommentID: row.ID,
		Revision:  row.Revision,
		IssueID:   row.IssueID,
		SafeHtml:  clean.SafeHTML,
		PlainText: clean.PlainText,
	}); err != nil {
		return err
	}
	mentions := make([]dbgen.CommentsInsertMentionParams, 0, len(body.MentionUserIDs))
	for _, id := range body.MentionUserIDs {
		mentions = append(mentions, dbgen.CommentsInsertMentionParams{
			CommentID:            row.ID,
			Version:              row.Revision,
			UserID:               id.UUID,
			DisplayLabelSnapshot: labels[id],
		})
	}
	photos := make([]dbgen.CommentsInsertPictureParams, 0, len(body.PictureIDs))
	for _, id := range body.PictureIDs {
		photos = append(photos, dbgen.CommentsInsertPictureParams{
			CommentID:    row.ID,
			Version:      row.Revision,
			IssueID:      row.IssueID,
			AttachmentID: id.UUID,
		})
	}
	var first error
	collect := func(_ int, err error) {
		if first == nil {
			first = err
		}
	}
	if len(mentions) > 0 {
		m.Queries.CommentsInsertMention(ctx, mentions).Exec(collect)
	}
	if first != nil {
		return first
	}
	if len(photos) > 0 {
		m.Queries.CommentsInsertPicture(ctx, photos).Exec(collect)
	}
	if first != nil {
		return first
	}
	selected := map[command.AssetID]bool{}
	for _, id := range body.AttachmentIDs {
		selected[id] = true
	}
	for _, id := range attachments.FileReferences(clean.SafeHTML, command.IssueID{UUID: row.IssueID}) {
		if !selected[id] {
			asset, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: id.UUID, CallerID: m.Actor.UserID.UUID})
			if err != nil || asset.Kind != "file" || asset.State != "published" || asset.IssueID != row.IssueID {
				continue
			}
		}
		if err := m.Queries.CommentsInsertAsset(ctx, dbgen.CommentsInsertAssetParams{
			CommentID:    row.ID,
			Version:      row.Revision,
			IssueID:      row.IssueID,
			AttachmentID: id.UUID,
		}); err != nil {
			return err
		}
	}

	return nil
}
func (s *Service) finish(ctx context.Context, m *command.Mutation, row dbgen.Comment, body Body, clean CanonicalBody, labels map[command.UserID]string, added []command.UserID, fields []activity.FieldChange, action command.Operation) (command.Change[CommentView], error) {
	if err := saveVersion(ctx, m, row, body, clean, labels); err != nil {
		return command.Change[CommentView]{}, err
	}
	project, issue := command.ProjectID{UUID: row.ProjectID}, command.IssueID{UUID: row.IssueID}
	event, err := activity.Append(ctx, m, activity.Draft{
		Action:       action,
		ResourceKind: activity.CommentResource,
		ResourceID:   row.ID,
		ProjectID:    &project,
		IssueID:      &issue,
		Changes:      fields,
	})
	if err != nil {
		return command.Change[CommentView]{}, err
	}
	work, err := m.Queries.CommentsResolveIssue(ctx, row.IssueID)
	if err != nil {
		return command.Change[CommentView]{}, err
	}
	effect := notifications.NewComment
	status := 201
	if action == command.UpdateComment {
		effect = notifications.EditedComment
		status = 200
	}
	summary := "Comment on " + work.Title
	if effect == notifications.EditedComment {
		summary = "Mention in an edited comment on " + work.Title
	}
	var assignee *command.UserID
	if work.AssigneeID != nil {
		assignee = &command.UserID{UUID: *work.AssigneeID}
	}
	if err := notifications.Write(ctx, m, event.ID, []notifications.Fact{{
		ProjectID:      project,
		IssueID:        issue,
		ReporterID:     command.UserID{UUID: work.ReporterID},
		AssigneeID:     assignee,
		MentionUserIDs: added,
		Effect:         effect,
		Summary:        summary,
	}}); err != nil {
		return command.Change[CommentView]{}, err
	}
	view, err := s.view(ctx, m, command.CommentID{UUID: row.ID})
	if err != nil {
		return command.Change[CommentView]{}, err
	}
	view.SanitationNotices = clean.SanitationNotices
	id := event.ID.String()
	return command.Change[CommentView]{Result: view, EventID: &id, HTTPStatus: status}, nil
}
func (s *Service) Create(ctx context.Context, actor command.Actor, in CreateInput) (command.SaveOutcome[CommentView], error) {
	empty := command.SaveOutcome[CommentView]{}
	body, err := normalizeBody(in.Body)
	if err != nil {
		return empty, err
	}
	args := struct {
		IssueID command.IssueID `json:"issueId"`
		Body    Body            `json:"body"`
	}{in.IssueID, body}
	ready, err := command.ReadResolved(ctx, s.runner, actor, command.Access{}, issueScopes(in.IssueID, true), func(ctx context.Context, m *command.Mutation) (bool, error) {
		return retryReady(ctx, m, command.CreateComment, in.RetryReference, args)
	})
	if err != nil {
		return empty, err
	}
	prepared := attachments.PreparedAssets{}
	if !ready {
		prepared, err = s.assets.PrepareAssets(ctx, actor, in.IssueID, commentAssetIDs(body))
		if err != nil {
			return empty, err
		}
	}
	return command.Save(ctx, s.runner, command.MutationRequest{
		Actor:           actor,
		Operation:       command.CreateComment,
		RetryReference:  in.RetryReference,
		ResolveProjects: issueScopes(in.IssueID, true),
	}, args, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, _ struct {
		IssueID command.IssueID `json:"issueId"`
		Body    Body            `json:"body"`
	}) (command.Change[CommentView], error) {
		if ready {
			return command.Change[CommentView]{}, errors.New("retry retention changed during preparation")
		}
		issue, err := m.Queries.CommentsResolveIssue(ctx, in.IssueID.UUID)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		project := command.ProjectID{UUID: issue.ProjectID}
		labels, added, err := mentionLabels(ctx, m, project, body, nil)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		clean, err := CanonicalizeWithFiles(body, labels, prepared.Pictures(), prepared.Files(), in.IssueID)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		fields, err := s.assets.CommitAssets(ctx, m, in.IssueID, prepared)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		row, err := m.Queries.CommentsInsert(ctx, dbgen.CommentsInsertParams{
			ID:        uuid.New(),
			ProjectID: project.UUID,
			IssueID:   in.IssueID.UUID,
			AuthorID:  actor.UserID.UUID,
		})
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		fields = append(fields, activity.FieldChange{Field: "safeHtml", After: &clean.SafeHTML}, activity.FieldChange{Field: "plainText", After: &clean.PlainText})
		return s.finish(ctx, m, row, body, clean, labels, added, fields, command.CreateComment)
	}, validateView)
}
func (s *Service) Update(ctx context.Context, actor command.Actor, in UpdateInput) (command.SaveOutcome[CommentView], error) {
	empty := command.SaveOutcome[CommentView]{}
	if in.ExpectedRevision < 1 {
		return empty, invalidBody("expectedRevision", "Read the current comment version before editing.")
	}
	body, err := normalizeBody(in.Body)
	if err != nil {
		return empty, err
	}
	args := struct {
		CommentID        command.CommentID `json:"commentId"`
		ExpectedRevision command.Revision  `json:"expectedRevision"`
		Body             Body              `json:"body"`
	}{in.CommentID, in.ExpectedRevision, body}
	type preflight struct {
		ready bool
		issue command.IssueID
	}
	pre, err := command.ReadResolved(ctx, s.runner, actor, command.Access{}, commentScopes(in.CommentID, true), func(ctx context.Context, m *command.Mutation) (preflight, error) {
		row, err := m.Queries.CommentsResolve(ctx, in.CommentID.UUID)
		if err != nil {
			return preflight{}, err
		}
		if row.AuthorID != actor.UserID.UUID {
			return preflight{}, forbidden()
		}
		ready, err := retryReady(ctx, m, command.UpdateComment, in.RetryReference, args)
		return preflight{ready, command.IssueID{UUID: row.IssueID}}, err
	})
	if err != nil {
		return empty, err
	}
	prepared := attachments.PreparedAssets{}
	if !pre.ready {
		prepared, err = s.assets.PrepareAssets(ctx, actor, pre.issue, commentAssetIDs(body))
		if err != nil {
			return empty, err
		}
	}
	return command.Save(ctx, s.runner, command.MutationRequest{
		Actor:           actor,
		Operation:       command.UpdateComment,
		RetryReference:  in.RetryReference,
		ResolveProjects: commentScopes(in.CommentID, true),
	}, args, func(ctx context.Context, m *command.Mutation) error {
		row, err := m.Queries.CommentsResolve(ctx, in.CommentID.UUID)
		if err != nil {
			return err
		}
		if row.AuthorID != actor.UserID.UUID {
			return forbidden()
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, _ struct {
		CommentID        command.CommentID `json:"commentId"`
		ExpectedRevision command.Revision  `json:"expectedRevision"`
		Body             Body              `json:"body"`
	}) (command.Change[CommentView], error) {
		if pre.ready {
			return command.Change[CommentView]{}, errors.New("retry retention changed during preparation")
		}
		current, err := s.view(ctx, m, in.CommentID)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		if current.Revision != in.ExpectedRevision {
			return command.Change[CommentView]{}, conflict(current)
		}
		row, err := m.Queries.CommentsResolve(ctx, in.CommentID.UUID)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		labels, added, err := mentionLabels(ctx, m, command.ProjectID{UUID: row.ProjectID}, body, current.Mentions)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		clean, err := CanonicalizeWithFiles(body, labels, prepared.Pictures(), prepared.Files(), pre.issue)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		if clean.SafeHTML == current.SafeHTML {
			return command.Change[CommentView]{Result: current, HTTPStatus: 200}, nil
		}
		fields, err := s.assets.CommitAssets(ctx, m, pre.issue, prepared)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		row, err = m.Queries.CommentsAdvance(ctx, row.ID)
		if err != nil {
			return command.Change[CommentView]{}, err
		}
		fields = append(fields, activity.FieldChange{
			Field:  "safeHtml",
			Before: &current.SafeHTML,
			After:  &clean.SafeHTML,
		}, activity.FieldChange{
			Field:  "plainText",
			Before: &current.PlainText,
			After:  &clean.PlainText,
		})
		return s.finish(ctx, m, row, body, clean, labels, added, fields, command.UpdateComment)
	}, validateView)
}

type commentPosition struct {
	CreatedAt time.Time `json:"createdAt"`
	ID        uuid.UUID `json:"id"`
}

func (s *Service) List(ctx context.Context, actor command.Actor, in ListInput) (command.Page[CommentView], error) {
	empty := command.Page[CommentView]{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListComments, actor.UserID, "created_at,id", in.IssueID)
	if err != nil {
		return empty, err
	}
	position := commentPosition{}
	if in.Page.Cursor != nil {
		position, err = command.ReadCursor[commentPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(in.IssueID, false), func(ctx context.Context, m *command.Mutation) (command.Page[CommentView], error) {
		rows, err := m.Queries.CommentsList(ctx, dbgen.CommentsListParams{
			IssueID:   in.IssueID.UUID,
			HasCursor: in.Page.Cursor != nil,
			AfterTime: pgtype.Timestamptz{Time: position.CreatedAt, Valid: true},
			AfterID:   position.ID,
			PageSize:  int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.CommentsCount(ctx, in.IssueID.UUID)
		if err != nil {
			return empty, err
		}
		items := make([]CommentView, 0, len(rows))
		for _, row := range rows {
			view, err := commentView(m, dbgen.CommentsViewRow(row))
			if err != nil {
				return empty, err
			}
			items = append(items, view)
		}
		return command.BuildPage(s.cursors, scope, items, size, int(count), false, func(v CommentView) commentPosition { return commentPosition{v.CreatedAt, v.ID.UUID} })
	})
}
func (s *Service) Versions(ctx context.Context, actor command.Actor, in ListVersionsInput) (command.Page[VersionView], error) {
	empty := command.Page[VersionView]{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListCommentVersions, actor.UserID, "revision", in.CommentID)
	if err != nil {
		return empty, err
	}
	after := int64(0)
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[int64](s.cursors, scope, *in.Page.Cursor)
		if err != nil || after < 1 {
			return empty, invalidBody("page.cursor", "Start a new version history traversal.")
		}
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, commentScopes(in.CommentID, false), func(ctx context.Context, m *command.Mutation) (command.Page[VersionView], error) {
		rows, err := m.Queries.CommentsVersions(ctx, dbgen.CommentsVersionsParams{
			CommentID:     in.CommentID.UUID,
			AfterRevision: after,
			PageSize:      int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.CommentsVersionCount(ctx, in.CommentID.UUID)
		if err != nil {
			return empty, err
		}
		items := make([]VersionView, 0, len(rows))
		for _, r := range rows {
			ids := make([]command.PictureID, 0, len(r.PictureIds))
			for _, id := range r.PictureIds {
				ids = append(ids, command.PictureID{UUID: id})
			}
			files := make([]command.AssetID, 0, len(r.AttachmentIds))
			for _, id := range r.AttachmentIds {
				files = append(files, command.AssetID{UUID: id})
			}
			items = append(items, VersionView{
				AttachmentIDs: files,
				CommentID:     in.CommentID,
				Revision:      command.Revision(r.Revision),
				SafeHTML:      r.SafeHtml,
				PlainText:     r.PlainText,
				PictureIDs:    ids,
				CreatedAt:     r.CreatedAt.Time.UTC(),
			})
		}
		return command.BuildPage(s.cursors, scope, items, size, int(count), false, func(v VersionView) int64 { return int64(v.Revision) })
	})
}

func commentAssetIDs(body Body) []command.AssetID {
	ids := append([]command.AssetID(nil), body.AttachmentIDs...)
	for _, id := range body.PictureIDs {
		ids = append(ids, command.AssetID{UUID: id.UUID})
	}
	return ids
}
