package issues

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Service struct {
	assets    *attachments.Service
	runner    command.Runner
	cursors   *command.CursorSigner
	boards    command.BoardAccess
	stageRule func(context.Context, *command.Mutation, command.ProjectID, command.IssueID, command.Status) error
}

func New(runner command.Runner, cursors *command.CursorSigner) *Service {
	return &Service{runner: runner, cursors: cursors}
}
func (s *Service) WithAssets(assets *attachments.Service) { s.assets = assets }
func (s *Service) WithBoards(access command.BoardAccess)  { s.boards = access }

// WithStageRule injects a transaction-bound collaborator without importing another feature.
func (s *Service) WithStageRule(rule func(context.Context, *command.Mutation, command.ProjectID, command.IssueID, command.Status) error) {
	s.stageRule = rule
}
func validation(field, message string) error {
	return &command.Failure{
		Code:        command.Validation,
		Message:     message,
		FieldErrors: []command.FieldError{{Field: field, Message: message}},
		NextAction:  command.ReviewFields,
	}
}
func normalizeEditable(input IssueEditable) (IssueEditable, error) {
	input.Title = strings.TrimSpace(input.Title)
	if command.ValidateText(input.Title, 1, 200) != nil {
		return input, validation("title", "Titles must contain 1–200 characters.")
	}
	if command.ValidateText(input.Description, 0, 10000) != nil {
		return input, validation("description", "Descriptions may contain up to 10000 characters.")
	}
	if !input.DescriptionFormat.Valid() {
		return input, validation("descriptionFormat", "Choose plain or HTML description text.")
	}
	if input.DescriptionFormat == command.HTMLDescription {
		value, err := cleanDescription(input.Description)
		if err != nil {
			return input, err
		}
		input.Description = value
	}
	if !input.Type.Valid() {
		return input, validation("type", "Choose Task, Bug or the existing Subtask type.")
	}
	if !input.Priority.Valid() {
		return input, validation("priority", "Choose Low, Medium or High priority.")
	}
	if input.AssigneeID != nil && input.AssigneeID.UUID == uuid.Nil {
		return input, validation("assigneeId", "Select an eligible assignee or clear the assignment.")
	}
	if input.DueDate != nil {
		if _, err := command.ParseDate(input.DueDate.String()); err != nil {
			return input, validation("dueDate", "Choose a valid calendar date.")
		}
	}
	if len(input.LabelIDs) > 10 {
		return input, validation("labelIds", "An issue can have at most ten labels.")
	}
	seen := map[command.LabelID]bool{}
	for _, id := range input.LabelIDs {
		if id.UUID == uuid.Nil || seen[id] {
			return input, validation("labelIds", "Select distinct valid labels.")
		}
		seen[id] = true
	}
	input.LabelIDs = append([]command.LabelID{}, input.LabelIDs...)
	sort.Slice(input.LabelIDs, func(i, j int) bool { return input.LabelIDs[i].String() < input.LabelIDs[j].String() })
	return input, nil
}
func dateValue(value *command.CalendarDate) pgtype.Date {
	if value == nil {
		return pgtype.Date{}
	}
	date, _ := time.Parse("2006-01-02", value.String())
	return pgtype.Date{Time: date, Valid: true}
}
func userUUID(value *command.UserID) *uuid.UUID {
	if value == nil {
		return nil
	}
	id := value.UUID
	return &id
}
func labelUUIDs(ids []command.LabelID) []uuid.UUID {
	result := []uuid.UUID{}
	for _, id := range ids {
		result = append(result, id.UUID)
	}
	return result
}
func checkReferences(ctx context.Context, m *command.Mutation, project command.ProjectID, args IssueEditable) error {
	if args.AssigneeID != nil {
		valid, err := m.Queries.IssuesAssigneeEligible(ctx, dbgen.IssuesAssigneeEligibleParams{
			ID:        args.AssigneeID.UUID,
			ProjectID: project.UUID,
		})
		if err != nil {
			return err
		}
		if !valid {
			return validation("assigneeId", "The assignee must be an active Administrator or project Member.")
		}
	}
	count, err := m.Queries.IssuesLabelsEligible(ctx, dbgen.IssuesLabelsEligibleParams{
		ProjectID: project.UUID,
		Column2:   labelUUIDs(args.LabelIDs),
	})
	if err != nil {
		return err
	}
	if int(count) != len(args.LabelIDs) {
		return validation("labelIds", "Every label must belong to this project.")
	}
	return nil
}
func setLabels(ctx context.Context, m *command.Mutation, project command.ProjectID, issue command.IssueID, labels []command.LabelID) error {
	if err := m.Queries.IssuesClearLabels(ctx, issue.UUID); err != nil {
		return err
	}
	return m.Queries.IssuesSetLabels(ctx, dbgen.IssuesSetLabelsParams{
		ProjectID: project.UUID,
		IssueID:   issue.UUID,
		Column3:   labelUUIDs(labels),
	})
}
func issueScopes(id command.IssueID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.ReadIssue(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailableIssue()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func (s *Service) Get(ctx context.Context, actor command.Actor, id command.IssueID) (IssueView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, issueScopes(id, false), func(ctx context.Context, m *command.Mutation) (IssueView, error) {
		if err := requireLegacyIssue(ctx, m, id); err != nil {
			return IssueView{}, err
		}
		return readView(ctx, m, id)
	})
}

func Summary(row dbgen.IssuesGetRow, today command.CalendarDate) (IssueSummary, error) {
	i := row.Issue
	labels, err := database.DecodeJSON[[]LabelView](row.Labels)
	if err != nil {
		return IssueSummary{}, err
	}
	result := IssueSummary{
		Archived:               i.Archived,
		Backlog:                i.Backlog,
		StatusName:             row.StatusName,
		ID:                     command.IssueID{UUID: i.ID},
		ProjectID:              command.ProjectID{UUID: i.ProjectID},
		Key:                    row.ProjectKey + "-" + strconv.FormatInt(i.Number, 10),
		Number:                 command.Revision(i.Number),
		Title:                  i.Title,
		Type:                   command.IssueType(i.Type),
		Priority:               command.Priority(i.Priority),
		Status:                 command.Status(i.Status),
		Labels:                 labels,
		Blocked:                row.UnfinishedBlockerCount > 0,
		UnfinishedBlockerCount: row.UnfinishedBlockerCount,
		SubtaskProgress:        SubtaskProgress{Total: row.ChildTotal, Done: row.ChildDone},
		Revision:               command.Revision(i.Revision),
		CreatedAt:              i.CreatedAt.Time.UTC(),
		UpdatedAt:              i.UpdatedAt.Time.UTC(),
	}
	if i.AssigneeID != nil && row.AssigneeName != nil {
		result.Assignee.Value = &IssueUserSummary{ID: command.UserID{UUID: *i.AssigneeID}, DisplayName: *row.AssigneeName}
	}
	if i.ParentID != nil && row.ParentNumber != nil {
		result.Parent.Value = &ParentRef{
			ID:  command.IssueID{UUID: *i.ParentID},
			Key: row.ProjectKey + "-" + strconv.FormatInt(*row.ParentNumber, 10),
		}
	}
	if i.DueDate.Valid {
		date, err := command.ParseDate(i.DueDate.Time.Format("2006-01-02"))
		if err != nil {
			return result, err
		}
		result.DueDate = &date
		result.Overdue = date.Before(today) && result.Status.Category() != command.Done
	}
	return result, nil
}
func readView(ctx context.Context, m *command.Mutation, id command.IssueID) (IssueView, error) {
	return readViewBase(ctx, m, id, true)
}
func readViewBase(ctx context.Context, m *command.Mutation, id command.IssueID, legacyWorkflow bool) (IssueView, error) {
	row, err := m.Queries.IssuesGet(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return IssueView{}, unavailableIssue()
	}
	if err != nil {
		return IssueView{}, err
	}
	value, err := Summary(row, m.Actor.Today)
	if err != nil {
		return IssueView{}, err
	}
	project, err := m.Queries.ReadProject(ctx, row.Issue.ProjectID)
	if err != nil {
		return IssueView{}, err
	}
	writable := m.User.IsAdministrator
	if permissions, err := m.ProjectPermissions(value.ProjectID); err == nil {
		writable = permissions.CanWrite
	} else if !writable {
		membership, err := m.Queries.ReadMembership(ctx, dbgen.ReadMembershipParams{ProjectID: project.ID, UserID: m.User.ID})
		if err != nil {
			return IssueView{}, err
		}
		writable = command.Role(membership.Role).CanWrite() && !membership.RemovedAt.Valid
	}
	capabilities := []Capability{Read}
	if writable && !project.ArchivedAt.Valid {
		capabilities = append(capabilities, Edit, Move, Comment, UploadPicture, ManageDependencies)
		if value.Type != command.Subtask && value.Status.Category() != command.Done {
			capabilities = append(capabilities, AddSubtask)
		}
	}
	orders := []ColumnOrder{}
	var source command.Revision
	if legacyWorkflow {
		rows, err := m.Queries.IssuesOrders(ctx, project.ID)
		if err != nil {
			return IssueView{}, err
		}
		for _, order := range rows {
			orders = append(orders, ColumnOrder{
				Status:   command.Status(order.Status),
				Revision: command.Revision(order.Revision),
			})
			if order.Status == row.Issue.Status {
				source = command.Revision(order.Revision)
			}
		}
	}
	result := IssueView{
		Summary:           value,
		Description:       row.Issue.Description,
		DescriptionFormat: command.DescriptionFormat(row.Issue.DescriptionFormat),
		Reporter: IssueUserSummary{
			ID:          command.UserID{UUID: row.Issue.ReporterID},
			DisplayName: row.ReporterName,
		},
		GraphRevision:       command.Revision(project.GraphRevision),
		SourceOrderRevision: source,
		Capabilities:        capabilities,
		OrderRevisions:      orders,
	}
	watching, err := m.Queries.IssuesWatching(ctx, dbgen.IssuesWatchingParams{IssueID: id.UUID, UserID: m.User.ID})
	if err != nil {
		return IssueView{}, err
	}
	result.Watching = watching
	links, err := m.Queries.IssuesLinks(ctx, id.UUID)
	if err != nil {
		return IssueView{}, err
	}
	for _, link := range links {
		if len(result.Links) == 100 {
			break
		}
		result.Links = append(result.Links, command.IssueLinkView{
			IssueID:  command.IssueID{UUID: link.IssueID},
			TargetID: command.IssueID{UUID: link.TargetID},
			Kind:     link.Kind,
			Key:      link.Key,
			Title:    link.Title,
			Status:   command.Status(link.Status),
		})
	}
	if !legacyWorkflow {
		return result, nil
	}
	board, err := m.Queries.BoardsDefault(ctx, project.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, validateView(result)
	}
	if err != nil {
		return IssueView{}, err
	}
	workflow, err := database.DecodeJSON[command.BoardWorkflow](board.Board.Workflow)
	if err != nil {
		return IssueView{}, err
	}
	result.Workflow = &workflow
	return result, validateView(result)
}
func validateView(v IssueView) error {
	if v.Summary.ID.UUID == uuid.Nil || v.Summary.ProjectID.UUID == uuid.Nil || v.Summary.Revision < 1 || v.Summary.Number < 1 || !v.Summary.Status.Valid() || !v.Summary.Type.Valid() || !v.Summary.Priority.Valid() || v.Reporter.ID.UUID == uuid.Nil || v.GraphRevision < 1 || v.SourceOrderRevision < 1 || len(v.OrderRevisions) < 4 || v.Summary.Labels == nil || v.Capabilities == nil || v.Summary.CreatedAt.IsZero() || v.Summary.UpdatedAt.IsZero() {
		return errors.New("invalid issue result")
	}
	if !v.DescriptionFormat.Valid() || command.ValidateText(v.Summary.Title, 1, 200) != nil || command.ValidateText(v.Description, 0, 10000) != nil {
		return errors.New("invalid issue text")
	}
	return nil
}
func issueEvent(ctx context.Context, m *command.Mutation, op command.Operation, v IssueView, changes []activity.FieldChange, facts []notifications.Fact) (*string, error) {
	project := v.Summary.ProjectID
	issue := v.Summary.ID
	event, err := activity.Append(ctx, m, activity.Draft{
		Action:       op,
		ResourceKind: activity.IssueResource,
		ResourceID:   issue.UUID,
		ProjectID:    &project,
		IssueID:      &issue,
		Changes:      changes,
	})
	if err != nil {
		return nil, err
	}
	facts = append(facts, fact(v, notifications.IssueUpdated))
	if err := notifications.Write(ctx, m, event.ID, facts); err != nil {
		return nil, err
	}
	id := event.ID.String()
	return &id, nil
}
func fact(v IssueView, effect notifications.Effect) notifications.Fact {
	var assignee *command.UserID
	if v.Summary.Assignee.Value != nil {
		id := v.Summary.Assignee.Value.ID
		assignee = &id
	}
	return notifications.Fact{
		ProjectID:  v.Summary.ProjectID,
		IssueID:    v.Summary.ID,
		ReporterID: v.Reporter.ID,
		AssigneeID: assignee,
		Effect:     effect,
		Summary:    v.Summary.Key + ": " + v.Summary.Title,
	}
}
func modernIssueEvent(ctx context.Context, m *command.Mutation, op command.Operation, v ModernIssueView, changes []activity.FieldChange, facts []notifications.Fact) (*string, error) {
	project := v.Summary.ProjectID
	issue := v.Summary.ID
	event, err := activity.Append(ctx, m, activity.Draft{
		Action:       op,
		ResourceKind: activity.IssueResource,
		ResourceID:   issue.UUID,
		ProjectID:    &project,
		IssueID:      &issue,
		Changes:      changes,
	})
	if err != nil {
		return nil, err
	}
	facts = append(facts, modernFact(v, notifications.IssueUpdated))
	if err := notifications.Write(ctx, m, event.ID, facts); err != nil {
		return nil, err
	}
	id := event.ID.String()
	return &id, nil
}
func modernFact(v ModernIssueView, effect notifications.Effect) notifications.Fact {
	var assignee *command.UserID
	if v.Summary.Assignee.Value != nil {
		id := v.Summary.Assignee.Value.ID
		assignee = &id
	}
	return notifications.Fact{
		ProjectID:  v.Summary.ProjectID,
		IssueID:    v.Summary.ID,
		ReporterID: v.Reporter.ID,
		AssigneeID: assignee,
		Effect:     effect,
		Summary:    v.Summary.Key + ": " + v.Summary.Title,
	}
}
func editableFromModern(v ModernIssueView) IssueEditable {
	labels := []command.LabelID{}
	for _, l := range v.Summary.Labels {
		labels = append(labels, l.ID)
	}
	sort.Slice(labels, func(i, j int) bool { return labels[i].String() < labels[j].String() })
	var user *command.UserID
	if v.Summary.Assignee.Value != nil {
		id := v.Summary.Assignee.Value.ID
		user = &id
	}
	return IssueEditable{
		Title:             v.Summary.Title,
		Description:       v.Description,
		DescriptionFormat: v.DescriptionFormat,
		AssigneeID:        user,
		DueDate:           v.Summary.DueDate,
		LabelIDs:          labels,
	}
}

type createCommand struct {
	Backlog         bool              `json:"backlog,omitempty"`
	ImportSourceKey string            `json:"importSourceKey,omitempty"`
	InitialStatus   command.Status    `json:"initialStatus,omitempty"`
	ProjectID       command.ProjectID `json:"projectId"`
	Editable        IssueEditable     `json:"editable"`
}

func (s *Service) Create(ctx context.Context, actor command.Actor, input CreateInput) (command.SaveOutcome[IssueView], error) {
	kind := input.Type
	if kind == "" {
		kind = command.Task
	}
	priority := input.Priority
	if priority == "" {
		priority = command.Medium
	}
	args, err := normalizeEditable(IssueEditable{
		Title:             input.Title,
		Description:       input.Description,
		DescriptionFormat: input.DescriptionFormat,
		Type:              kind,
		Priority:          priority,
		AssigneeID:        input.AssigneeID,
		DueDate:           input.DueDate,
		LabelIDs:          input.LabelIDs,
	})
	if err != nil {
		return command.SaveOutcome[IssueView]{}, err
	}
	if err := validateNewDescription(args); err != nil {
		return command.SaveOutcome[IssueView]{}, err
	}
	if args.Type == command.Subtask {
		return command.SaveOutcome[IssueView]{}, validation("type", "Create a Subtask through its parent issue.")
	}
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.CreateIssue,
		RetryReference: input.RetryReference,
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID, Write: true}}},
	}
	if command.ValidateText(input.ImportSourceKey, 0, 200) != nil || strings.TrimSpace(input.ImportSourceKey) != input.ImportSourceKey {
		return command.SaveOutcome[IssueView]{}, validation("importSourceKey", "Use a stable source key up to200 characters without surrounding spaces.")
	}
	return command.Save(ctx, s.runner, request, createCommand{
		ProjectID:       input.ProjectID,
		Editable:        args,
		InitialStatus:   input.InitialStatus,
		Backlog:         input.Backlog,
		ImportSourceKey: input.ImportSourceKey,
	}, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, args createCommand) (command.Change[IssueView], error) {
		if err := requireLegacyProject(ctx, m, args.ProjectID); err != nil {
			return command.Change[IssueView]{}, err
		}
		if args.ImportSourceKey != "" {
			existing, err := m.Queries.ImportSourceGet(ctx, dbgen.ImportSourceGetParams{
				ProjectID: args.ProjectID.UUID,
				SourceKey: args.ImportSourceKey,
			})
			if err == nil {
				view, err := readView(ctx, m, command.IssueID{UUID: existing})
				return command.Change[IssueView]{Result: view, HTTPStatus: 200}, err
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				return command.Change[IssueView]{}, err
			}
		}
		if err := checkReferences(ctx, m, args.ProjectID, args.Editable); err != nil {
			return command.Change[IssueView]{}, err
		}
		number, err := m.Queries.IssuesAllocateNumber(ctx, args.ProjectID.UUID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		start, err := initialStage(ctx, m, args.ProjectID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		status := start
		if args.InitialStatus != "" && args.InitialStatus != start {
			if !args.InitialStatus.Valid() {
				return command.Change[IssueView]{}, validation("initialStatus", "Choose an active project stage.")
			}
			if s.boards.Transition == nil {
				return command.Change[IssueView]{}, validation("initialStatus", "Project workflow is unavailable.")
			}
			if err := s.boards.Transition(ctx, m, args.ProjectID, nil, start, args.InitialStatus); err != nil {
				return command.Change[IssueView]{}, err
			}
			status = args.InitialStatus
		}
		rank, err := AppendRank(ctx, m, args.ProjectID, status)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		id := command.NewID[command.IssueKind]()
		if args.Backlog && status.Category() != command.Todo {
			return command.Change[IssueView]{}, validation("backlog", "Planned work must start in an unstarted stage.")
		}
		backlogRank, err := appendBacklogRank(ctx, m, args.ProjectID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		a := args.Editable
		if _, err := m.Queries.IssuesInsert(ctx, dbgen.IssuesInsertParams{
			Status:            string(status),
			ID:                id.UUID,
			ProjectID:         args.ProjectID.UUID,
			Number:            number,
			Title:             a.Title,
			Description:       a.Description,
			DescriptionFormat: a.DescriptionFormat.Stored(),
			Type:              string(a.Type),
			Priority:          string(a.Priority),
			ReporterID:        m.User.ID,
			AssigneeID:        userUUID(a.AssigneeID),
			DueDate:           dateValue(a.DueDate),
			Rank:              rank,
		}); err != nil {
			return command.Change[IssueView]{}, err
		}
		if err := setLabels(ctx, m, args.ProjectID, id, a.LabelIDs); err != nil {
			return command.Change[IssueView]{}, err
		}
		if err := m.Queries.BacklogSetOnCreate(ctx, dbgen.BacklogSetOnCreateParams{
			ID:          id.UUID,
			Backlog:     args.Backlog,
			BacklogRank: backlogRank,
		}); err != nil {
			return command.Change[IssueView]{}, err
		}
		if args.Backlog {
			if _, err := m.Queries.BacklogAdvanceOrder(ctx, args.ProjectID.UUID); err != nil {
				return command.Change[IssueView]{}, err
			}
		}
		if !args.Backlog && s.stageRule != nil {
			if err := s.stageRule(ctx, m, args.ProjectID, id, status); err != nil {
				return command.Change[IssueView]{}, err
			}
		}
		if args.ImportSourceKey != "" {
			if err := m.Queries.ImportSourceSave(ctx, dbgen.ImportSourceSaveParams{
				ProjectID: args.ProjectID.UUID,
				SourceKey: args.ImportSourceKey,
				IssueID:   id.UUID,
			}); err != nil {
				return command.Change[IssueView]{}, err
			}
		}
		if !args.Backlog {
			if _, err := AdvanceOrder(ctx, m, args.ProjectID, status); err != nil {
				return command.Change[IssueView]{}, err
			}
		}
		view, err := readView(ctx, m, id)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		changes := editableChanges(nil, &a)
		key := view.Summary.Key
		changes = append(changes, activity.FieldChange{Field: "key", After: &key})
		createdStatus := string(view.Summary.Status)
		changes = append(changes, activity.FieldChange{Field: "status", After: &createdStatus})
		facts := []notifications.Fact{}
		if a.AssigneeID != nil {
			facts = append(facts, fact(view, notifications.NewAssignment))
		}
		event, err := issueEvent(ctx, m, command.CreateIssue, view, changes, facts)
		return command.Change[IssueView]{Result: view, EventID: event, HTTPStatus: 201}, err
	}, validateView)
}

type updateCommand struct {
	IssueID          command.IssueID  `json:"issueId"`
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Editable         IssueEditable    `json:"editable"`
}

func (s *Service) Update(ctx context.Context, actor command.Actor, input UpdateInput) (command.SaveOutcome[IssueView], error) {
	args, err := normalizeEditable(input.Editable)
	if err != nil {
		return command.SaveOutcome[IssueView]{}, err
	}
	if input.ExpectedRevision < 1 {
		return command.SaveOutcome[IssueView]{}, validation("expectedRevision", "Read the current issue revision before saving.")
	}
	prepared, err := s.prepareDescriptionAssets(ctx, actor, input.IssueID, args)
	if err != nil {
		return command.SaveOutcome[IssueView]{}, err
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.UpdateIssue,
		RetryReference:  input.RetryReference,
		ResolveProjects: issueScopes(input.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, updateCommand{input.IssueID, input.ExpectedRevision, args}, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.ReadIssue(ctx, input.IssueID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, args updateCommand) (command.Change[IssueView], error) {
		if err := requireLegacyIssue(ctx, m, args.IssueID); err != nil {
			return command.Change[IssueView]{}, err
		}
		current, err := readView(ctx, m, args.IssueID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		if current.Summary.Revision != args.ExpectedRevision {
			return command.Change[IssueView]{}, conflict(current)
		}
		return s.applyEditable(ctx, m, current, args.Editable, command.UpdateIssue, prepared)
	}, validateView)
}

func (s *Service) applyEditable(ctx context.Context, m *command.Mutation, current IssueView, editable IssueEditable, operation command.Operation, prepared attachments.PreparedAssets) (command.Change[IssueView], error) {
	if (current.Summary.Type == command.Subtask) != (editable.Type == command.Subtask) {
		return command.Change[IssueView]{}, validation("type", "Subtask relationships and type are immutable.")
	}
	if err := checkReferences(ctx, m, current.Summary.ProjectID, editable); err != nil {
		return command.Change[IssueView]{}, err
	}
	publication, err := s.commitDescriptionAssets(ctx, m, current.Summary.ID, prepared)
	if err != nil {
		return command.Change[IssueView]{}, err
	}
	if err := validateDescriptionPictures(ctx, m, current.Summary.ID, editable); err != nil {
		return command.Change[IssueView]{}, err
	}
	before := editableFrom(current)
	changes := append(editableChanges(&before, &editable), publication...)
	if len(changes) == 0 {
		return command.Change[IssueView]{Result: current, HTTPStatus: 200}, nil
	}
	a := editable
	if _, err := m.Queries.IssuesUpdate(ctx, dbgen.IssuesUpdateParams{
		ID:                current.Summary.ID.UUID,
		Title:             a.Title,
		Description:       a.Description,
		DescriptionFormat: a.DescriptionFormat.Stored(),
		Type:              string(a.Type),
		Priority:          string(a.Priority),
		AssigneeID:        userUUID(a.AssigneeID),
		DueDate:           dateValue(a.DueDate),
	}); err != nil {
		return command.Change[IssueView]{}, err
	}
	if err := setLabels(ctx, m, current.Summary.ProjectID, current.Summary.ID, a.LabelIDs); err != nil {
		return command.Change[IssueView]{}, err
	}
	view, err := readView(ctx, m, current.Summary.ID)
	if err != nil {
		return command.Change[IssueView]{}, err
	}
	facts := []notifications.Fact{}
	if pointerText(before.AssigneeID) != pointerText(a.AssigneeID) && a.AssigneeID != nil {
		facts = append(facts, fact(view, notifications.NewAssignment))
	}
	if pointerText(before.DueDate) != pointerText(a.DueDate) {
		facts = append(facts, fact(view, notifications.ChangedDueDate))
	}
	event, err := issueEvent(ctx, m, operation, view, changes, facts)
	return command.Change[IssueView]{Result: view, EventID: event, HTTPStatus: 200}, err
}

func editableFrom(v IssueView) IssueEditable {
	labels := []command.LabelID{}
	for _, l := range v.Summary.Labels {
		labels = append(labels, l.ID)
	}
	sort.Slice(labels, func(i, j int) bool { return labels[i].String() < labels[j].String() })
	var user *command.UserID
	if v.Summary.Assignee.Value != nil {
		id := v.Summary.Assignee.Value.ID
		user = &id
	}
	return IssueEditable{
		Title:             v.Summary.Title,
		Description:       v.Description,
		DescriptionFormat: v.DescriptionFormat,
		Type:              v.Summary.Type,
		Priority:          v.Summary.Priority,
		AssigneeID:        user,
		DueDate:           v.Summary.DueDate,
		LabelIDs:          labels,
	}
}
func pointerText[T interface{ String() string }](value *T) string {
	if value == nil {
		return ""
	}
	return (*value).String()
}
func editableChanges(before, after *IssueEditable) []activity.FieldChange {
	changes := []activity.FieldChange{}
	add := func(name, old, new string) {
		if before == nil {
			changes = append(changes, activity.FieldChange{Field: name, After: &new})
		} else if old != new {
			changes = append(changes, activity.FieldChange{Field: name, Before: &old, After: &new})
		}
	}
	old := IssueEditable{}
	if before != nil {
		old = *before
	}
	add("title", old.Title, after.Title)
	add("description", old.Description, after.Description)
	add("descriptionFormat", old.DescriptionFormat.Stored(), after.DescriptionFormat.Stored())
	add("type", string(old.Type), string(after.Type))
	add("priority", string(old.Priority), string(after.Priority))
	add("assigneeId", pointerText(old.AssigneeID), pointerText(after.AssigneeID))
	add("dueDate", pointerText(old.DueDate), pointerText(after.DueDate))
	a, _ := json.Marshal(old.LabelIDs)
	b, _ := json.Marshal(after.LabelIDs)
	add("labelIds", string(a), string(b))
	return changes
}
