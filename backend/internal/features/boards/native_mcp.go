package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func registerNativeMCP(server *mcp.Server, s *Service) error {
	if err := registerTool(server, command.GetBoardLayout, "Read independent columns, workflow stage mappings and full saved-view counts.", false, s.GetLayout); err != nil {
		return err
	}
	if err := registerTool(server, command.ListNativeBoardCards, "Read a ranked-then-unranked column page with explicit terminal state and scoped cursors.", false, s.NativeCards); err != nil {
		return err
	}
	if err := registerTool(server, command.CreateModernBoard, "Create an independent named board using the default stage mappings without copying issue ranks.", false, func(ctx context.Context, a command.Actor, in CreateInput) (command.Saved[LayoutView], error) {
		out, err := s.CreateModernBoard(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.SaveBoardLayout, "Save column grouping, names, order and warning/hard limits. Keep default-board coverage and full-view hard capacity valid.", true, func(ctx context.Context, a command.Actor, in SaveLayoutInput) (command.Saved[LayoutView], error) {
		out, err := s.SaveLayout(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := registerTool(server, command.MoveBoardCard, "Move a board card with current issue, layout and column revisions. Supply an explicit stage for ambiguous grouped destinations.", true, func(ctx context.Context, a command.Actor, in NativeMoveInput) (command.Saved[NativeMoveResult], error) {
		out, err := s.MoveCard(ctx, a, in)
		return out.Body, err
	}); err != nil {
		return err
	}
	return registerTool(server, command.ReorderBoardCard, "Change this board's card order in the same column without editing issue content or other boards.", true, func(ctx context.Context, a command.Actor, in NativeMoveInput) (command.Saved[NativeMoveResult], error) {
		out, err := s.ReorderCard(ctx, a, in)
		return out.Body, err
	})
}
