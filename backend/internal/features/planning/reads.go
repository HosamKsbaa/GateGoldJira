package planning

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"strconv"
	"time"
)

type itemPosition struct {
	Kind string    `json:"kind"`
	Name string    `json:"name"`
	ID   uuid.UUID `json:"id"`
}
type itemFilters struct {
	ProjectID command.ProjectID `json:"projectId"`
	Kind      *Kind             `json:"kind"`
}

func (s *Service) List(ctx context.Context, actor command.Actor, in PlanningListInput) (command.Page[PlanningItemView], error) {
	empty := command.Page[PlanningItemView]{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	if in.Kind != nil && !validKind(*in.Kind) {
		return empty, validation("kind", "Choose epic or release.")
	}
	scope, err := command.CursorScopeFor(command.ListPlanningItems, actor.UserID, "kind,name,id", itemFilters{in.ProjectID, in.Kind})
	if err != nil {
		return empty, err
	}
	after := itemPosition{}
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[itemPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: in.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[PlanningItemView], error) {
		var kind *string
		if in.Kind != nil {
			v := string(*in.Kind)
			kind = &v
		}
		rows, err := m.Queries.PlanningList(ctx, dbgen.PlanningListParams{
			ProjectID: in.ProjectID.UUID,
			Kind:      kind,
			HasCursor: in.Page.Cursor != nil,
			AfterKind: after.Kind,
			AfterName: after.Name,
			AfterID:   after.ID,
			PageSize:  int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.PlanningCount(ctx, dbgen.PlanningCountParams{ProjectID: in.ProjectID.UUID, Kind: kind})
		if err != nil {
			return empty, err
		}
		items := []PlanningItemView{}
		for _, row := range rows {
			items = append(items, PlanningItemView{
				ID:             ID{UUID: row.ID},
				ProjectID:      command.ProjectID{UUID: row.ProjectID},
				Kind:           Kind(row.Kind),
				Name:           row.Name,
				Description:    row.Description,
				TargetDate:     dateView(row.TargetDate),
				Status:         Status(row.Status),
				Revision:       command.Revision(row.Revision),
				IssueCount:     row.IssueCount,
				CompletedCount: row.CompletedCount,
				CreatedAt:      row.CreatedAt.Time,
				UpdatedAt:      row.UpdatedAt.Time,
			})
		}
		return command.BuildPage(s.cursors, scope, items, size, int(count), false, func(item PlanningItemView) itemPosition {
			return itemPosition{string(item.Kind), item.Name, item.ID.UUID}
		})
	})
}

type numberPosition struct {
	Number int64 `json:"number"`
}

func (s *Service) ListIssues(ctx context.Context, actor command.Actor, in PlanningIssuesInput) (command.Page[PlanningIssueSummary], error) {
	empty := command.Page[PlanningIssueSummary]{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListPlanningIssues, actor.UserID, "number", struct {
		ProjectID  command.ProjectID
		PlanningID ID
	}{in.ProjectID, in.PlanningID})
	if err != nil {
		return empty, err
	}
	after := numberPosition{}
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[numberPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: in.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[PlanningIssueSummary], error) {
		item, err := readItem(ctx, m, in.PlanningID, in.ProjectID)
		if err != nil {
			return empty, err
		}
		rows, err := m.Queries.PlanningIssueMembers(ctx, dbgen.PlanningIssueMembersParams{
			ProjectID:   in.ProjectID.UUID,
			PlanningID:  &in.PlanningID.UUID,
			AfterNumber: after.Number,
			PageSize:    int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		items := []PlanningIssueSummary{}
		for _, row := range rows {
			items = append(items, PlanningIssueSummary{
				StageName: row.StageName,
				ID:        command.IssueID{UUID: row.ID},
				Number:    strconv.FormatInt(row.Number, 10),
				Title:     row.Title,
				Status:    command.Status(row.Status),
			})
		}
		return command.BuildPage(s.cursors, scope, items, size, int(item.IssueCount), false, func(item PlanningIssueSummary) numberPosition {
			n, _ := strconv.ParseInt(item.Number, 10, 64)
			return numberPosition{n}
		})
	})
}

const reportDefinition = "Completed cycles count each recorded transition into a Done category, including a completion after reopening. Cycle time starts at the first In progress/Review transition; reopening starts a new cycle immediately. Returning to To do keeps the clock running. Completions without a recorded start count toward throughput but not average cycle time. Dates and daily buckets use UTC. Aging and blocked work are a current snapshot of non-archived work on the active board; work age starts at creation."

func (s *Service) Report(ctx context.Context, actor command.Actor, in KanbanReportInput) (KanbanReport, error) {
	empty := KanbanReport{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	start, err := time.Parse("2006-01-02", in.From.String())
	if err != nil {
		return empty, validation("from", "Choose a start date.")
	}
	through, err := time.Parse("2006-01-02", in.Through.String())
	if err != nil {
		return empty, validation("through", "Choose an end date.")
	}
	end := through.AddDate(0, 0, 1)
	if through.Before(start) || end.Sub(start) > 366*24*time.Hour {
		return empty, validation("through", "Choose an inclusive date window of at most 366 days.")
	}
	scope, err := command.CursorScopeFor(command.GetKanbanReport, actor.UserID, "number", struct {
		ProjectID     command.ProjectID
		From, Through command.CalendarDate
	}{in.ProjectID, in.From, in.Through})
	if err != nil {
		return empty, err
	}
	after := numberPosition{}
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[numberPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{
		RepeatableRead: true,
		Projects:       []command.ProjectScope{{ProjectID: in.ProjectID}},
	}, func(ctx context.Context, m *command.Mutation) (KanbanReport, error) {
		summary, err := m.Queries.PlanningReportSummary(ctx, dbgen.PlanningReportSummaryParams{
			ProjectID:   &in.ProjectID.UUID,
			WindowStart: pgtype.Timestamptz{Time: start, Valid: true},
			WindowEnd:   pgtype.Timestamptz{Time: end, Valid: true},
		})
		if err != nil {
			return empty, err
		}
		days, err := m.Queries.PlanningReportDays(ctx, dbgen.PlanningReportDaysParams{
			ProjectID:   &in.ProjectID.UUID,
			WindowStart: pgtype.Timestamptz{Time: start, Valid: true},
			WindowEnd:   pgtype.Timestamptz{Time: end, Valid: true},
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.PlanningReportCurrentCount(ctx, in.ProjectID.UUID)
		if err != nil {
			return empty, err
		}
		rows, err := m.Queries.PlanningReportWork(ctx, dbgen.PlanningReportWorkParams{
			ProjectID:   in.ProjectID.UUID,
			AfterNumber: after.Number,
			PageSize:    int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		project, err := m.Queries.ReadProject(ctx, in.ProjectID.UUID)
		if err != nil {
			return empty, err
		}
		now := time.Now().UTC()
		items := []AgingIssue{}
		for _, row := range rows {
			item := AgingIssue{
				StageName:          row.StageName,
				ID:                 command.IssueID{UUID: row.ID},
				Key:                project.Key + "-" + strconv.FormatInt(row.Number, 10),
				Title:              row.Title,
				Status:             command.Status(row.Status),
				WorkAgeDays:        max(0, now.Sub(row.CreatedAt.Time).Hours()/24),
				UnfinishedBlockers: row.UnfinishedBlockers,
			}
			if row.AssigneeID != nil && row.DisplayName != nil {
				item.Assignee.Value = &command.IssueUserSummary{
					ID:          command.UserID{UUID: *row.AssigneeID},
					DisplayName: *row.DisplayName,
				}
			}
			if row.StartedAt.Valid {
				t := row.StartedAt.Time.UTC()
				age := max(0, now.Sub(t).Hours()/24)
				item.StartedAt = &t
				item.CycleAgeDays = &age
			}
			items = append(items, item)
		}
		work, err := command.BuildPage(s.cursors, scope, items, size, int(count.ActiveCount), false, func(item AgingIssue) numberPosition {
			n, _ := strconv.ParseInt(item.Key[len(project.Key)+1:], 10, 64)
			return numberPosition{n}
		})
		if err != nil {
			return empty, err
		}
		report := KanbanReport{
			ProjectID:       in.ProjectID,
			From:            in.From,
			Through:         in.Through,
			SnapshotAt:      now,
			CompletedCycles: summary.CompletedCycles,
			MeasuredCycles:  summary.MeasuredCycles,
			ActiveCount:     count.ActiveCount,
			BlockedCount:    count.BlockedCount,
			Days:            []ThroughputDay{},
			Work:            work,
			Definition:      reportDefinition,
		}
		if summary.MeasuredCycles > 0 {
			report.AverageCycleDays = &summary.AverageCycleDays
		}
		for _, day := range days {
			value := dateView(day.Day)
			if value != nil {
				report.Days = append(report.Days, ThroughputDay{Day: *value, CompletedCycles: day.CompletedCycles})
			}
		}
		return report, nil
	})
}
