package configuration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerFieldMCP(server *mcp.Server, s *Service) error {
	if err := registerTool(server, command.ListFields, "Fields: scoped typed values and current rule revisions; historical data retained.", s.Fields); err != nil {
		return err
	}
	if err := registerTool(server, command.ListFieldOptions, "FieldOptions: scoped typed values and current rule revisions; historical data retained.", s.FieldOptions); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveField, "SaveField: scoped typed values and current rule revisions; historical data retained.", func(ctx context.Context, a command.Actor, in SaveFieldInput) (command.Saved[FieldSaved], error) {
		out, err := s.SaveField(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveFieldOption, "SaveFieldOption: scoped typed values and current rule revisions; historical data retained.", func(ctx context.Context, a command.Actor, in SaveFieldOptionInput) (command.Saved[FieldOptionSaved], error) {
		out, err := s.SaveFieldOption(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.BackfillFieldDefaults, "BackfillField: scoped typed values and current rule revisions; historical data retained.", func(ctx context.Context, a command.Actor, in BackfillFieldInput) (command.Saved[BackfillFieldResult], error) {
		out, err := s.BackfillField(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.GetTransitionPolicy, "GetTransitionPolicy: scoped typed values and current rule revisions; historical data retained.", s.GetTransitionPolicy); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveTransitionPolicy, "SaveTransitionPolicy: scoped typed values and current rule revisions; historical data retained.", func(ctx context.Context, a command.Actor, in SaveTransitionPolicyInput) (command.Saved[TransitionPolicyView], error) {
		out, err := s.SaveTransitionPolicy(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return nil
}
