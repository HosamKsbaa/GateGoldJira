package configuration

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"sort"
)

type SystemField string

const (
	RequiredAssignee    SystemField = "assignee"
	RequiredDueDate     SystemField = "due_date"
	RequiredDescription SystemField = "description"
)

type TransitionPolicy struct {
	RequiredSystemFields []SystemField                                  `json:"requiredSystemFields" nullable:"false" maxItems:"3" uniqueItems:"true"`
	RequiredFieldIDs     []command.FieldID                              `json:"requiredFieldIds" nullable:"false" maxItems:"100" uniqueItems:"true"`
	ApprovalsRequired    int32                                          `json:"approvalsRequired" minimum:"0" maximum:"100"`
	ApproverRole         command.Nullable[command.TransitionPermission] `json:"approverRole"`
	ExcludeIssueReporter bool                                           `json:"excludeIssueReporter"`
}
type TransitionPolicyInput struct {
	ProjectID    command.ProjectID    `json:"projectId"`
	WorkflowID   command.WorkflowID   `json:"workflowId"`
	TransitionID command.TransitionID `json:"transitionId"`
}
type TransitionPolicyFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Policy           TransitionPolicy `json:"policy"`
}
type SaveTransitionPolicyInput struct {
	ProjectID    command.ProjectID    `json:"projectId"`
	WorkflowID   command.WorkflowID   `json:"workflowId"`
	TransitionID command.TransitionID `json:"transitionId"`
	TransitionPolicyFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type TransitionPolicyView struct {
	Configuration    ConfigurationView    `json:"configuration"`
	WorkflowRevision command.Revision     `json:"workflowRevision"`
	TransitionID     command.TransitionID `json:"transitionId"`
	Policy           TransitionPolicy     `json:"policy"`
}

func normalizePolicy(in TransitionPolicy) (TransitionPolicy, error) {
	if in.ApprovalsRequired < 0 || in.ApprovalsRequired > 100 || (in.ApprovalsRequired == 0) != (in.ApproverRole.Value == nil) || in.ApproverRole.Value != nil && !in.ApproverRole.Value.Valid() || len(in.RequiredFieldIDs) > 100 || len(in.RequiredSystemFields) > 3 {
		return in, validation("policy", "Choose a checked reviewer role for a positive approval count, or disable approvals. Requirements must be bounded.")
	}
	systems := map[SystemField]bool{}
	for _, field := range in.RequiredSystemFields {
		if field != RequiredAssignee && field != RequiredDueDate && field != RequiredDescription || systems[field] {
			return in, validation("requiredSystemFields", "Choose distinct assignee, due_date or description requirements.")
		}
		systems[field] = true
	}
	fields := map[command.FieldID]bool{}
	for _, field := range in.RequiredFieldIDs {
		if field.UUID == uuid.Nil || fields[field] {
			return in, validation("requiredFieldIds", "Use distinct nonzero custom field IDs.")
		}
		fields[field] = true
	}
	if in.RequiredSystemFields == nil {
		in.RequiredSystemFields = []SystemField{}
	}
	if in.RequiredFieldIDs == nil {
		in.RequiredFieldIDs = []command.FieldID{}
	}
	sort.Slice(in.RequiredSystemFields, func(i, j int) bool { return in.RequiredSystemFields[i] < in.RequiredSystemFields[j] })
	sort.Slice(in.RequiredFieldIDs, func(i, j int) bool { return in.RequiredFieldIDs[i].String() < in.RequiredFieldIDs[j].String() })
	return in, nil
}
func readPolicy(ctx context.Context, m *command.Mutation, in TransitionPolicyInput) (TransitionPolicyView, error) {
	row, err := m.Queries.ConfigurationTransitionPolicy(ctx, dbgen.ConfigurationTransitionPolicyParams{
		ProjectID:  in.ProjectID.UUID,
		WorkflowID: in.WorkflowID.UUID,
		ID:         in.TransitionID.UUID,
	})
	if err != nil {
		return TransitionPolicyView{}, unavailable()
	}
	required, err := m.Queries.ConfigurationPolicyRequirements(ctx, in.TransitionID.UUID)
	if err != nil {
		return TransitionPolicyView{}, err
	}
	policy := TransitionPolicy{
		ApprovalsRequired:    int32(row.ApprovalsRequired),
		ExcludeIssueReporter: row.ExcludeIssueReporter,
		RequiredSystemFields: []SystemField{},
		RequiredFieldIDs:     []command.FieldID{},
	}
	if row.ApproverRole != nil {
		role := command.TransitionPermission(*row.ApproverRole)
		policy.ApproverRole.Value = &role
	}
	for _, requirement := range required {
		if requirement.FieldID != nil {
			policy.RequiredFieldIDs = append(policy.RequiredFieldIDs, command.FieldID{UUID: *requirement.FieldID})
		}
		if requirement.SystemField != nil {
			policy.RequiredSystemFields = append(policy.RequiredSystemFields, SystemField(*requirement.SystemField))
		}
	}
	policy, err = normalizePolicy(policy)
	if err != nil {
		return TransitionPolicyView{}, err
	}
	root, err := readView(ctx, m, in.ProjectID)
	if err != nil {
		return TransitionPolicyView{}, err
	}
	flow, err := readWorkflow(ctx, m, in.ProjectID, in.WorkflowID)
	if err != nil {
		return TransitionPolicyView{}, err
	}
	return TransitionPolicyView{
		Configuration:    root,
		WorkflowRevision: command.Revision(flow.Revision),
		TransitionID:     in.TransitionID,
		Policy:           policy,
	}, nil
}
func (s *Service) GetTransitionPolicy(ctx context.Context, actor command.Actor, in TransitionPolicyInput) (TransitionPolicyView, error) {
	return command.Read(ctx, s.runner, actor, command.Access{
		RepeatableRead: true,
		Projects:       []command.ProjectScope{{ProjectID: in.ProjectID}},
	}, func(ctx context.Context, m *command.Mutation) (TransitionPolicyView, error) {
		return readPolicy(ctx, m, in)
	})
}
func (s *Service) SaveTransitionPolicy(ctx context.Context, actor command.Actor, in SaveTransitionPolicyInput) (command.SaveOutcome[TransitionPolicyView], error) {
	policy, err := normalizePolicy(in.Policy)
	if err != nil {
		return command.SaveOutcome[TransitionPolicyView]{}, err
	}
	in.Policy = policy
	if in.ExpectedRevision < 1 {
		return command.SaveOutcome[TransitionPolicyView]{}, validation("expectedRevision", "Read current configuration before changing review rules.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SaveTransitionPolicy, in.ProjectID, in.RetryReference), in, func(ctx context.Context, m *command.Mutation) error {
		_, err := readPolicy(ctx, m, TransitionPolicyInput{in.ProjectID, in.WorkflowID, in.TransitionID})
		return err
	}, func(ctx context.Context, m *command.Mutation, in SaveTransitionPolicyInput) (command.Change[TransitionPolicyView], error) {
		empty := command.Change[TransitionPolicyView]{}
		root, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return empty, err
		}
		current, err := readPolicy(ctx, m, TransitionPolicyInput{in.ProjectID, in.WorkflowID, in.TransitionID})
		if err != nil {
			return empty, err
		}
		before, _ := json.Marshal(current.Policy)
		after, _ := json.Marshal(in.Policy)
		if string(before) == string(after) {
			return command.Change[TransitionPolicyView]{Result: current, HTTPStatus: 200}, nil
		}
		if root.Mode != Modern {
			return empty, validation("policy", "Publish review and required-field rules only after native client cutover.")
		}
		flow, err := editableWorkflow(ctx, m, in.ProjectID, in.WorkflowID)
		if err != nil {
			return empty, err
		}
		if flow.Retired {
			return empty, validation("workflow", "Retired workflows retain their existing rules.")
		}
		for _, id := range in.Policy.RequiredFieldIDs {
			field, err := m.Queries.ConfigurationField(ctx, dbgen.ConfigurationFieldParams{ProjectID: in.ProjectID.UUID, ID: id.UUID})
			if err != nil || field.Retired {
				return empty, validation("requiredFieldIds", "Choose active custom fields in this project.")
			}
		}
		var role *string
		if in.Policy.ApproverRole.Value != nil {
			value := string(*in.Policy.ApproverRole.Value)
			role = &value
		}
		if err = m.Queries.ConfigurationSavePolicy(ctx, dbgen.ConfigurationSavePolicyParams{
			ID:                   in.TransitionID.UUID,
			ApprovalsRequired:    int16(in.Policy.ApprovalsRequired),
			ApproverRole:         role,
			ExcludeIssueReporter: in.Policy.ExcludeIssueReporter,
		}); err != nil {
			return empty, err
		}
		if err = m.Queries.ConfigurationClearPolicyRequirements(ctx, in.TransitionID.UUID); err != nil {
			return empty, err
		}
		for _, field := range in.Policy.RequiredSystemFields {
			value := string(field)
			if err = m.Queries.ConfigurationInsertPolicyRequirement(ctx, dbgen.ConfigurationInsertPolicyRequirementParams{
				ID:           uuid.New(),
				ProjectID:    in.ProjectID.UUID,
				WorkflowID:   in.WorkflowID.UUID,
				TransitionID: in.TransitionID.UUID,
				SystemField:  &value,
			}); err != nil {
				return empty, err
			}
		}
		for _, field := range in.Policy.RequiredFieldIDs {
			id := field.UUID
			if err = m.Queries.ConfigurationInsertPolicyRequirement(ctx, dbgen.ConfigurationInsertPolicyRequirementParams{
				ID:           uuid.New(),
				ProjectID:    in.ProjectID.UUID,
				WorkflowID:   in.WorkflowID.UUID,
				TransitionID: in.TransitionID.UUID,
				FieldID:      &id,
			}); err != nil {
				return empty, err
			}
		}
		if err = m.Queries.ConfigurationWorkflowAdvance(ctx, in.WorkflowID.UUID); err != nil {
			return empty, err
		}
		event, err := configurationEvent(ctx, m, command.SaveTransitionPolicy, in.ProjectID, []activity.FieldChange{change("transitionPolicy."+in.TransitionID.String(), string(before), string(after))})
		if err != nil {
			return empty, err
		}
		next, err := readPolicy(ctx, m, TransitionPolicyInput{in.ProjectID, in.WorkflowID, in.TransitionID})
		return command.Change[TransitionPolicyView]{Result: next, EventID: event, HTTPStatus: 200}, err
	}, func(v TransitionPolicyView) error {
		if v.TransitionID.UUID == uuid.Nil || v.WorkflowRevision < 1 {
			return errors.New("invalid transition policy")
		}
		return validateView(v.Configuration)
	})
}
