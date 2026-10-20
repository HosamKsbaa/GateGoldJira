package activity

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func RegisterMCP(server *mcp.Server, service *Service) error {
	return mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.ListActivity,
		Description: "Read paginated history: company history requires Administrator; an exact issue resourceKind/resourceId allows current project readers. Read retained activity history with retained human attribution and relevant changes. Resource filters require kind and ID together; personal inbox content is private.",
	}, func(ctx context.Context, in ListInput) (command.Page[ActivityView], error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return command.Page[ActivityView]{}, err
		}
		return service.List(ctx, actor, in)
	})
}
