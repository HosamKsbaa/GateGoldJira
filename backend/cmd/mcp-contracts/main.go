// Export the official registered MCP schemas without running business handlers,
// reading account credentials or opening a network/database connection.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"gategoldjira/backend/internal/app"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"os"
	"time"
)

func main() {
	if err := export(); err != nil {
		fmt.Fprintln(os.Stderr, "MCP contract export failed:", err)
		os.Exit(1)
	}
}
func export() error {
	server, err := app.MCPContracts()
	if err != nil {
		return err
	}
	left, right := mcp.NewInMemoryTransports()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	ss, err := server.Connect(ctx, left, nil)
	if err != nil {
		return err
	}
	defer ss.Close()
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "contract-export", Version: "1"}, nil).Connect(ctx, right, nil)
	if err != nil {
		return err
	}
	defer cs.Close()
	document := struct {
		Tools map[string]*mcp.Tool `json:"tools"`
	}{Tools: map[string]*mcp.Tool{}}
	cursor := ""
	for {
		page, err := cs.ListTools(ctx, &mcp.ListToolsParams{Cursor: cursor})
		if err != nil {
			return err
		}
		for _, tool := range page.Tools {
			document.Tools[tool.Name] = tool
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(document)
}
