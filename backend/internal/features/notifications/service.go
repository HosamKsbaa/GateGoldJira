package notifications

import (
	"context"
	"errors"
	"strconv"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type Service struct {
	runner                 command.Runner
	cursors                *command.CursorSigner
	emailDeliveryAvailable bool
}

func New(runner command.Runner, cursors *command.CursorSigner) *Service {
	return &Service{runner: runner, cursors: cursors}
}

// Configure only during startup, before either transport accepts requests.
func (s *Service) SetEmailDeliveryAvailable(available bool) { s.emailDeliveryAvailable = available }

type inboxPosition struct {
	CreatedAt time.Time `json:"createdAt"`
	ID        uuid.UUID `json:"id"`
}

func unavailable() error {
	return &command.Failure{
		Code:        command.Unavailable,
		Message:     "The notification is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func validateView(v NotificationView) error {
	if v.ID.UUID == uuid.Nil || v.IssueID.UUID == uuid.Nil || v.ProjectID.UUID == uuid.Nil || v.Actor.ID.UUID == uuid.Nil || v.Revision < 1 || v.CreatedAt.IsZero() {
		return errors.New("invalid notification projection")
	}
	if err := command.ValidateText(v.IssueKey, 1, 32); err != nil {
		return err
	}
	if err := command.ValidateText(v.Summary, 0, 10000); err != nil {
		return err
	}
	if err := command.ValidateText(v.Actor.DisplayName, 1, 200); err != nil {
		return err
	}
	if len(v.Reasons) == 0 || len(v.Reasons) > 10 {
		return errors.New("invalid notification reasons")
	}
	seen := map[Reason]bool{}
	for _, reason := range v.Reasons {
		switch reason {
		case Watching, Comment, Mention, Assignment, Status, DueDate, DependencyBlocked, DependencyResolved, SubtaskCreated, SubtasksCompleted:
		default:
			return errors.New("unknown notification reason")
		}
		if seen[reason] {
			return errors.New("duplicate notification reason")
		}
		seen[reason] = true
	}
	return nil
}
func view(row dbgen.InboxGetRow) (NotificationView, error) {
	v := NotificationView{
		ID:        command.NotificationID{UUID: row.ID},
		IssueID:   command.IssueID{UUID: row.IssueID},
		ProjectID: command.ProjectID{UUID: row.ProjectID},
		IssueKey:  row.IssueKey,
		Actor: command.IssueUserSummary{
			ID:          command.UserID{UUID: row.ActorID},
			DisplayName: row.ActorName,
		},
		Reasons:   []Reason{},
		Summary:   row.PlainTextSummary,
		CreatedAt: row.CreatedAt.Time.UTC(),
		Revision:  command.Revision(row.Revision),
	}
	for _, reason := range row.Reasons {
		v.Reasons = append(v.Reasons, Reason(reason))
	}
	if row.ReadAt.Valid {
		readAt := row.ReadAt.Time.UTC()
		v.ReadAt = &readAt
	}
	return v, validateView(v)
}
func get(ctx context.Context, m *command.Mutation, id command.NotificationID) (NotificationView, error) {
	row, err := m.Queries.InboxGet(ctx, dbgen.InboxGetParams{
		NotificationID: id.UUID,
		CallerID:       m.User.ID,
		IsAdmin:        m.User.IsAdministrator,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return NotificationView{}, unavailable()
	}
	if err != nil {
		return NotificationView{}, err
	}
	return view(row)
}
func summary(ctx context.Context, m *command.Mutation) (InboxSummary, error) {
	count, err := m.Queries.InboxCount(ctx, dbgen.InboxCountParams{
		CallerID:   m.User.ID,
		IsAdmin:    m.User.IsAdministrator,
		UnreadOnly: true,
	})
	return InboxSummary{UnreadCount: count, CompanyToday: m.Actor.Today}, err
}
func (s *Service) Summary(ctx context.Context, a command.Actor) (InboxSummary, error) {
	return command.Read(ctx, s.runner, a, command.Access{RepeatableRead: true}, summary)
}
func (s *Service) List(ctx context.Context, a command.Actor, in ListInput) (command.Page[NotificationView], error) {
	empty := command.Page[NotificationView]{}
	limit, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListNotifications, a.UserID, "createdAt DESC,id DESC", struct {
		UnreadOnly bool `json:"unreadOnly"`
	}{in.UnreadOnly})
	if err != nil {
		return empty, err
	}
	after := inboxPosition{}
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[inboxPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.Read(ctx, s.runner, a, command.Access{RepeatableRead: true}, func(ctx context.Context, m *command.Mutation) (command.Page[NotificationView], error) {
		rows, err := m.Queries.InboxList(ctx, dbgen.InboxListParams{
			CallerID:   m.User.ID,
			IsAdmin:    m.User.IsAdministrator,
			UnreadOnly: in.UnreadOnly,
			HasCursor:  in.Page.Cursor != nil,
			AfterTime:  pgtype.Timestamptz{Time: after.CreatedAt, Valid: true},
			AfterID:    after.ID,
			PageSize:   int32(limit + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.InboxCount(ctx, dbgen.InboxCountParams{
			CallerID:   m.User.ID,
			IsAdmin:    m.User.IsAdministrator,
			UnreadOnly: in.UnreadOnly,
		})
		if err != nil {
			return empty, err
		}
		values := []NotificationView{}
		for _, row := range rows {
			v, err := view(dbgen.InboxGetRow(row))
			if err != nil {
				return empty, err
			}
			values = append(values, v)
		}
		return command.BuildPage(s.cursors, scope, values, limit, int(count), false, func(v NotificationView) inboxPosition { return inboxPosition{v.CreatedAt, v.ID.UUID} })
	})
}
func notificationScope(id command.NotificationID) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.InboxGet(ctx, dbgen.InboxGetParams{
			NotificationID: id.UUID,
			CallerID:       m.User.ID,
			IsAdmin:        m.User.IsAdministrator,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}}}, nil
	}
}
func (s *Service) Get(ctx context.Context, a command.Actor, id command.NotificationID) (NotificationView, error) {
	return command.ReadResolved(ctx, s.runner, a, command.Access{RepeatableRead: true}, notificationScope(id), func(ctx context.Context, m *command.Mutation) (NotificationView, error) { return get(ctx, m, id) })
}

type readCommand struct {
	NotificationID   command.NotificationID `json:"notificationId"`
	ExpectedRevision command.Revision       `json:"expectedRevision"`
	Read             bool                   `json:"read"`
}

func (s *Service) SetRead(ctx context.Context, a command.Actor, in SetReadInput) (command.SaveOutcome[NotificationView], error) {
	if in.ExpectedRevision < 1 {
		return command.SaveOutcome[NotificationView]{}, &command.Failure{
			Code:        command.Validation,
			Message:     "Read the current notification revision before changing its state.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	request := command.MutationRequest{
		Actor:           a,
		Operation:       command.SetNotificationRead,
		RetryReference:  in.RetryReference,
		ResolveProjects: notificationScope(in.NotificationID),
	}
	args := readCommand{in.NotificationID, in.ExpectedRevision, in.Read}
	return command.Save(ctx, s.runner, request, args, func(ctx context.Context, m *command.Mutation) error {
		_, err := get(ctx, m, in.NotificationID)
		return err
	}, func(ctx context.Context, m *command.Mutation, args readCommand) (command.Change[NotificationView], error) {
		if _, err := m.Queries.InboxLockNotification(ctx, dbgen.InboxLockNotificationParams{
			NotificationID: args.NotificationID.UUID,
			CallerID:       m.User.ID,
		}); err != nil {
			return command.Change[NotificationView]{}, err
		}
		current, err := get(ctx, m, args.NotificationID)
		if err != nil {
			return command.Change[NotificationView]{}, err
		}
		if current.Revision != args.ExpectedRevision {
			return command.Change[NotificationView]{}, &NotificationConflict{
				Failure: &command.Failure{
					Code:        command.Conflict,
					Message:     "This notification changed. Reload its current read state.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.ReloadCurrentState,
				},
				Current: &current,
			}
		}
		beforeRead := current.ReadAt != nil
		if beforeRead == args.Read {
			return command.Change[NotificationView]{Result: current, HTTPStatus: 200}, nil
		}
		changed, err := m.Queries.InboxSetRead(ctx, dbgen.InboxSetReadParams{
			NotificationID:   args.NotificationID.UUID,
			CallerID:         m.User.ID,
			ExpectedRevision: int64(args.ExpectedRevision),
			IsRead:           args.Read,
		})
		if err != nil {
			return command.Change[NotificationView]{}, err
		}
		if changed != 1 {
			return command.Change[NotificationView]{}, errors.New("notification revision changed under lock")
		}
		saved, err := get(ctx, m, args.NotificationID)
		if err != nil {
			return command.Change[NotificationView]{}, err
		}
		before, after := strconv.FormatBool(beforeRead), strconv.FormatBool(args.Read)
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.SetNotificationRead,
			ResourceKind: activity.NotificationResource,
			ResourceID:   current.ID.UUID,
			ProjectID:    &current.ProjectID,
			IssueID:      &current.IssueID,
			Changes: []activity.FieldChange{{
				Field:  "read",
				Before: &before,
				After:  &after,
			}},
		})
		id := event.ID.String()
		return command.Change[NotificationView]{Result: saved, EventID: &id, HTTPStatus: 200}, err
	}, validateView)
}
func (s *Service) MarkAll(ctx context.Context, a command.Actor, in MarkAllInput) (command.SaveOutcome[MarkAllResult], error) {
	projects := []uuid.UUID{}
	request := command.MutationRequest{Actor: a, Operation: command.MarkAllNotificationsRead, RetryReference: in.RetryReference, ResolveProjects: func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		// Lock the current accessible projects, including empty inbox projects, before
		// touching notification rows. Producers share this lock order and transaction.
		ids, err := m.Queries.InboxAccessibleProjects(ctx, dbgen.InboxAccessibleProjectsParams{
			CallerID: m.User.ID,
			IsAdmin:  m.User.IsAdministrator,
		})
		if err != nil {
			return nil, err
		}
		scopes := []command.ProjectScope{}
		projects = ids
		for _, id := range ids {
			scopes = append(scopes, command.ProjectScope{ProjectID: command.ProjectID{UUID: id}})
		}
		return scopes, nil
	}}
	return command.Save(ctx, s.runner, request, struct{}{}, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, _ struct{}) (command.Change[MarkAllResult], error) {
		count, err := m.Queries.InboxMarkAllRead(ctx, dbgen.InboxMarkAllReadParams{CallerID: m.User.ID, ProjectIds: projects})
		if err != nil {
			return command.Change[MarkAllResult]{}, err
		}
		inbox, err := summary(ctx, m)
		if err != nil {
			return command.Change[MarkAllResult]{}, err
		}
		result := command.Change[MarkAllResult]{Result: MarkAllResult{ChangedCount: count, Inbox: inbox}, HTTPStatus: 200}
		if count == 0 {
			return result, nil
		}
		before, after := "0", strconv.Itoa(int(count))
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.MarkAllNotificationsRead,
			ResourceKind: activity.NotificationResource,
			ResourceID:   m.User.ID,
			Changes: []activity.FieldChange{{
				Field:  "changedCount",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return result, err
		}
		id := event.ID.String()
		result.EventID = &id
		return result, nil
	}, func(v MarkAllResult) error {
		if v.ChangedCount < 0 || v.Inbox.UnreadCount < 0 {
			return errors.New("invalid mark-all result")
		}
		_, err := v.Inbox.CompanyToday.MarshalJSON()
		return err
	})
}
