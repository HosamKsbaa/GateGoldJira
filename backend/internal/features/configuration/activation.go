package configuration

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

type ActivationProblem struct {
	Code    string `json:"code" enum:"default_board,default_filters,canonical_references,stage_coverage,creation_defaults,workflow_progression,configuration_limit"`
	Message string `json:"message" minLength:"1" maxLength:"300"`
}
type ActivationReadiness struct {
	Configuration        ConfigurationView                 `json:"configuration"`
	ProjectRevision      command.Revision                  `json:"projectRevision"`
	DefaultBoardID       command.Nullable[command.BoardID] `json:"defaultBoardId"`
	DefaultBoardRevision command.InitialRevision           `json:"defaultBoardRevision"`
	IssueCount           command.InitialRevision           `json:"issueCount"`
	Ready                bool                              `json:"ready"`
	Problems             []ActivationProblem               `json:"problems" nullable:"false" maxItems:"8"`
}
type ActivateFields struct {
	ExpectedRevision        command.Revision                  `json:"expectedRevision"`
	ExpectedProjectRevision command.Revision                  `json:"expectedProjectRevision"`
	ExpectedBoardID         command.Nullable[command.BoardID] `json:"expectedBoardId"`
	ExpectedBoardRevision   command.InitialRevision           `json:"expectedBoardRevision"`
	Confirm                 bool                              `json:"confirm"`
}
type ActivateInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	ActivateFields
	RetryReference string `json:"retryReference" format:"uuid"`
}

func activationReadiness(ctx context.Context, m *command.Mutation, project command.ProjectID) (ActivationReadiness, error) {
	cfg, err := readView(ctx, m, project)
	if err != nil {
		return ActivationReadiness{}, err
	}
	row, err := m.Queries.ConfigurationActivationSnapshot(ctx, project.UUID)
	if err != nil {
		return ActivationReadiness{}, err
	}
	out := ActivationReadiness{
		Configuration:        cfg,
		ProjectRevision:      command.Revision(row.ProjectRevision),
		DefaultBoardRevision: command.InitialRevision(row.BoardRevision),
		IssueCount:           command.InitialRevision(row.IssueCount),
		Problems:             []ActivationProblem{},
	}
	if row.BoardID != uuid.Nil {
		id := command.BoardID{UUID: row.BoardID}
		out.DefaultBoardID.Value = &id
	}
	add := func(code, message string) { out.Problems = append(out.Problems, ActivationProblem{code, message}) }
	if row.BoardID == uuid.Nil {
		add("default_board", "Restore an active default board before activation.")
	}
	if row.FilteredDefault {
		add("default_filters", "The default board must show all project work. Clear its saved filters first.")
	}
	if row.IncompleteReferences {
		add("canonical_references", "Complete canonical issue backfill before activation.")
	}
	if row.MissingCoverage {
		add("stage_coverage", "Map all open and occupied workflow stages to the default board.")
	}
	if _, _, err = eligibleType(ctx, m, project, cfg.Defaults.StandardTypeID, Standard); err != nil {
		var failure *command.Failure
		if !errors.As(err, &failure) {
			return out, err
		}
		add("creation_defaults", "Restore active standard/subtask defaults with eligible initial workflows.")
	} else if _, _, err = eligibleType(ctx, m, project, cfg.Defaults.SubtaskTypeID, Subtask); err != nil {
		var failure *command.Failure
		if !errors.As(err, &failure) {
			return out, err
		}
		add("creation_defaults", "Restore active standard/subtask defaults with eligible initial workflows.")
	}
	if _, err = eligiblePriority(ctx, m, project, cfg.Defaults.PriorityID); err != nil {
		var failure *command.Failure
		if !errors.As(err, &failure) {
			return out, err
		}
		add("creation_defaults", "Restore an active default priority.")
	}
	flows, err := m.Queries.ConfigurationActivationWorkflows(ctx, project.UUID)
	if err != nil {
		return out, err
	}
	if len(flows) > 1000 {
		add("configuration_limit", "Review projects with more than 1,000 active workflows before activation.")
	} else {
		for _, id := range flows {
			if err = checkFlowSafety(ctx, m, project, command.WorkflowID{UUID: id}, true); err != nil {
				var failure *command.Failure
				if !errors.As(err, &failure) {
					return out, err
				}
				add("workflow_progression", "Every workflow accepting or holding live work needs a valid initial stage and a path to Done.")
				break
			}
		}
	}
	out.Ready = len(out.Problems) == 0
	return out, nil
}
func (s *Service) ActivationReadiness(ctx context.Context, actor command.Actor, in GetInput) (ActivationReadiness, error) {
	return command.Read(ctx, s.runner, actor, command.Access{
		RepeatableRead: true,
		Projects: []command.ProjectScope{{
			ProjectID: in.ProjectID,
			Write:     true,
			Configure: true,
		}},
	}, func(ctx context.Context, m *command.Mutation) (ActivationReadiness, error) {
		return activationReadiness(ctx, m, in.ProjectID)
	})
}
func (s *Service) Activate(ctx context.Context, actor command.Actor, in ActivateInput) (command.SaveOutcome[ConfigurationView], error) {
	if !in.Confirm || in.ExpectedRevision < 1 || in.ExpectedProjectRevision < 1 {
		return command.SaveOutcome[ConfigurationView]{}, validation("confirm", "Review this project's current readiness and explicitly confirm activation.")
	}
	return command.Save(ctx, s.runner, request(actor, command.ActivateProjectCore, in.ProjectID, in.RetryReference), in, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, in ActivateInput) (command.Change[ConfigurationView], error) {
		p, err := activationReadiness(ctx, m, in.ProjectID)
		if err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		boardMatches := p.DefaultBoardID.Value != nil && in.ExpectedBoardID.Value != nil && *p.DefaultBoardID.Value == *in.ExpectedBoardID.Value
		if p.Configuration.Revision != in.ExpectedRevision || p.ProjectRevision != in.ExpectedProjectRevision || p.DefaultBoardRevision != in.ExpectedBoardRevision || !boardMatches {
			return command.Change[ConfigurationView]{}, conflict(p.Configuration)
		}
		if p.Configuration.Mode == Modern {
			return command.Change[ConfigurationView]{Result: p.Configuration, HTTPStatus: 200}, nil
		}
		if !p.Ready {
			return command.Change[ConfigurationView]{}, validation("activation", "Resolve the readiness problems and review this project again before activation.")
		}
		if err = m.Queries.ConfigurationActivate(ctx, in.ProjectID.UUID); err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		event, err := configurationEvent(ctx, m, command.ActivateProjectCore, in.ProjectID, []activity.FieldChange{change("coreMode", "legacy", "modern")})
		if err != nil {
			return command.Change[ConfigurationView]{}, err
		}
		current, err := readView(ctx, m, in.ProjectID)
		return command.Change[ConfigurationView]{Result: current, EventID: event, HTTPStatus: 200}, err
	}, validateView)
}
