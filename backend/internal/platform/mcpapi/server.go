// Package mcpapi serves the official stateless MCP transport.
package mcpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func New() *mcp.Server {
	return mcp.NewServer(&mcp.Implementation{Name: "GateGoldJira", Version: "1.0.0"}, &mcp.ServerOptions{
		PageSize:     50,
		Capabilities: &mcp.ServerCapabilities{Tools: &mcp.ToolCapabilities{}},
	})
}
func Handler(server *mcp.Server, sessions auth.Sessions, settings config.Config, gate *objectstore.TransferGate, recorder ...ActivityRecorder) http.Handler {
	sdk := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{
		Stateless:           true,
		JSONResponse:        true,
		MaxRequestBodyBytes: httpapi.MaximumTransportBytes,
	})
	metadataURL := strings.TrimSuffix(settings.MCPAudience, "/mcp") + "/.well-known/oauth-protected-resource/mcp"
	challenge := `Bearer resource_metadata="` + metadataURL + `"`
	appURL := settings.NotificationAppURL
	if appURL == "" && len(settings.AllowedOrigins) > 0 {
		appURL = settings.AllowedOrigins[0]
	}
	withLinks := http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		ctx := context.WithValue(request.Context(), applicationURLKey{}, appURL)
		if len(recorder) > 0 && recorder[0] != nil {
			ctx = context.WithValue(ctx, activityRecorderKey{}, recorder[0])
		}
		sdk.ServeHTTP(w, request.WithContext(ctx))
	})
	return httpapi.Authenticated(sessions, command.MCP, challenge, httpapi.Bounded(httpapi.Limits{
		RequestBytes:  httpapi.MaximumTransportBytes,
		ResponseBytes: httpapi.MaximumTransportBytes,
		Gate:          gate,
	}, withLinks))
}
func Metadata(mux *http.ServeMux, settings config.Config, issuerOverride ...string) {
	issuer := settings.Issuer
	if len(issuerOverride) > 0 {
		issuer = issuerOverride[0]
	}
	website := settings.NotificationAppURL
	if website == "" && len(settings.AllowedOrigins) > 0 {
		website = settings.AllowedOrigins[0]
	}
	mux.HandleFunc("GET /.well-known/oauth-protected-resource/mcp", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(struct {
			Resource      string   `json:"resource"`
			Servers       []string `json:"authorization_servers"`
			Scopes        []string `json:"scopes_supported"`
			BearerMethods []string `json:"bearer_methods_supported"`
			Website       string   `json:"gategoldjira_website_url,omitempty"`
		}{settings.MCPAudience, []string{issuer}, []string{settings.RequiredScope}, []string{"header"}, website})
	})
}
