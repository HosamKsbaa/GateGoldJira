package notifications

import (
	"context"
	"errors"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
)

func validPreferences(value NotificationPreferencesFields) error {
	if value.EmailMode != EmailOff && value.EmailMode != EmailInstant && value.EmailMode != EmailDaily {
		return &command.Failure{
			Code:        command.Validation,
			Message:     "Choose off, instant or daily email delivery.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	seen := map[Reason]bool{}
	for _, reason := range value.Events {
		switch reason {
		case Watching, Comment, Mention, Assignment, Status, DueDate, DependencyBlocked, DependencyResolved, SubtaskCreated, SubtasksCompleted:
		default:
			return &command.Failure{
				Code:        command.Validation,
				Message:     "Choose supported notification events.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReviewFields,
			}
		}
		if seen[reason] {
			return &command.Failure{
				Code:        command.Validation,
				Message:     "Choose each notification event once.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReviewFields,
			}
		}
		seen[reason] = true
	}
	if len(value.Events) > 10 {
		return &command.Failure{
			Code:        command.Validation,
			Message:     "Choose at most ten notification events.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	return nil
}

func validatePreferencesView(value NotificationPreferencesView) error {
	if value.Revision < 1 || value.Events == nil {
		return errors.New("invalid notification preferences projection")
	}
	return validPreferences(value.NotificationPreferencesFields)
}

func (s *Service) preferences(ctx context.Context, m *command.Mutation) (NotificationPreferencesView, error) {
	row, err := m.Queries.NotificationPreferencesGet(ctx, m.User.ID)
	if err != nil {
		return NotificationPreferencesView{}, err
	}
	value := NotificationPreferencesView{
		NotificationPreferencesFields: NotificationPreferencesFields{
			InAppEnabled: row.InAppEnabled,
			EmailMode:    EmailMode(row.EmailMode),
			DueReminders: row.DueReminders,
			Events:       []Reason{},
		},
		Revision:               command.Revision(row.Revision),
		EmailDeliveryAvailable: s.emailDeliveryAvailable,
	}
	for _, reason := range row.Events {
		value.Events = append(value.Events, Reason(reason))
	}
	return value, validatePreferencesView(value)
}

func (s *Service) Preferences(ctx context.Context, actor command.Actor) (NotificationPreferencesView, error) {
	return command.Read(ctx, s.runner, actor, command.Access{}, s.preferences)
}

func (s *Service) UpdatePreferences(ctx context.Context, actor command.Actor, in UpdateNotificationPreferencesInput) (command.SaveOutcome[NotificationPreferencesView], error) {
	if err := validPreferences(in.NotificationPreferencesFields); err != nil {
		return command.SaveOutcome[NotificationPreferencesView]{}, err
	}
	if in.ExpectedRevision < 1 {
		return command.SaveOutcome[NotificationPreferencesView]{}, &command.Failure{
			Code:        command.Validation,
			Message:     "Read your current preferences before saving.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	in.Events = append([]Reason{}, in.Events...)
	sort.Slice(in.Events, func(i, j int) bool { return in.Events[i] < in.Events[j] })
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.UpdateNotificationPreferences,
		RetryReference: in.RetryReference,
	}
	return command.Save(ctx, s.runner, request, in.UpdateNotificationPreferencesFields, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, args UpdateNotificationPreferencesFields) (command.Change[NotificationPreferencesView], error) {
		if err := m.Queries.NotificationPreferencesEnsure(ctx, m.User.ID); err != nil {
			return command.Change[NotificationPreferencesView]{}, err
		}
		if _, err := m.Queries.NotificationPreferencesLock(ctx, m.User.ID); err != nil {
			return command.Change[NotificationPreferencesView]{}, err
		}
		before, err := s.preferences(ctx, m)
		if err != nil {
			return command.Change[NotificationPreferencesView]{}, err
		}
		if before.Revision != args.ExpectedRevision {
			return command.Change[NotificationPreferencesView]{}, &command.Failure{
				Code:        command.Conflict,
				Message:     "Your notification preferences changed. Reload before saving again.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReloadCurrentState,
			}
		}
		oldEvents := append([]Reason{}, before.Events...)
		sort.Slice(oldEvents, func(i, j int) bool { return oldEvents[i] < oldEvents[j] })
		if before.InAppEnabled == args.InAppEnabled && before.EmailMode == args.EmailMode && before.DueReminders == args.DueReminders && reflect.DeepEqual(oldEvents, args.Events) {
			return command.Change[NotificationPreferencesView]{Result: before, HTTPStatus: 200}, nil
		}
		events := []string{}
		for _, reason := range args.Events {
			events = append(events, string(reason))
		}
		changed, err := m.Queries.NotificationPreferencesUpdate(ctx, dbgen.NotificationPreferencesUpdateParams{
			UserID:       m.User.ID,
			InAppEnabled: args.InAppEnabled,
			Events:       events,
			EmailMode:    string(args.EmailMode),
			DueReminders: args.DueReminders,
			Revision:     int64(args.ExpectedRevision),
		})
		if err != nil {
			return command.Change[NotificationPreferencesView]{}, err
		}
		if changed != 1 {
			return command.Change[NotificationPreferencesView]{}, errors.New("preferences revision changed under lock")
		}
		saved, err := s.preferences(ctx, m)
		if err != nil {
			return command.Change[NotificationPreferencesView]{}, err
		}
		oldEventText := make([]string, 0, len(oldEvents))
		for _, event := range oldEvents {
			oldEventText = append(oldEventText, string(event))
		}
		changes := []activity.FieldChange{}
		add := func(name, before, after string) {
			if before != after {
				changes = append(changes, activity.FieldChange{Field: name, Before: &before, After: &after})
			}
		}
		add("inAppEnabled", strconv.FormatBool(before.InAppEnabled), strconv.FormatBool(saved.InAppEnabled))
		add("events", strings.Join(oldEventText, ", "), strings.Join(events, ", "))
		add("emailMode", string(before.EmailMode), string(saved.EmailMode))
		add("dueReminders", strconv.FormatBool(before.DueReminders), strconv.FormatBool(saved.DueReminders))
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.UpdateNotificationPreferences,
			ResourceKind: activity.UserResource,
			ResourceID:   m.User.ID,
			Changes:      changes,
		})
		id := event.ID.String()
		return command.Change[NotificationPreferencesView]{Result: saved, EventID: &id, HTTPStatus: 200}, err
	}, validatePreferencesView)
}
