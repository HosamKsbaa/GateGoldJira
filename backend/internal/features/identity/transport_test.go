package identity

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestIdentityCatalogRegistrationAndSummaryOnlyCandidates(t *testing.T) {
	f := identityDatabase(t)
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.service)
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	operations := []string{
		"get_me",
		"list_users",
		"approve_user",
		"update_user",
		"list_memberships",
		"set_membership",
		"remove_membership",
		"list_assignees",
		"list_mention_candidates",
	}
	seen := map[string]bool{}
	encoded, err := json.Marshal(api.OpenAPI())
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range operations {
		if !strings.Contains(string(encoded), `"operationId":"`+name+`"`) {
			t.Fatalf("REST missing %s", name)
		}
	}
	st, ct := mcp.NewInMemoryTransports()
	session, err := server.Connect(context.Background(), st, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "identity-contract", Version: "1"}, nil).Connect(context.Background(), ct, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	tools, err := client.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, tool := range tools.Tools {
		seen[tool.Name] = true
	}
	for _, name := range operations {
		if !seen[name] {
			t.Fatalf("MCP missing %s", name)
		}
	}
	r := httptest.NewRequest("GET", "/api/v1/projects/"+f.project.String()+"/mention-candidates", nil)
	r = r.WithContext(auth.WithActor(r.Context(), f.viewer))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 200 || strings.Contains(w.Body.String(), "email") || strings.Contains(w.Body.String(), "administrator") {
		t.Fatalf("candidate privacy: %d %s", w.Code, w.Body.String())
	}
	r = httptest.NewRequest("GET", "/api/v1/admin/users", nil)
	r = r.WithContext(auth.WithActor(r.Context(), f.viewer))
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("private admin list exposed")
	}
}

type identityVerifier struct{}

func (identityVerifier) Verify(_ context.Context, header string, channel command.Channel) (command.ProviderIdentity, error) {
	if header != "Bearer local-owner" || channel != command.MCP {
		return command.ProviderIdentity{}, inactive()
	}
	email := "owner@example.test"
	return command.ProviderIdentity{Issuer: "https://issuer.test/", Subject: "human|owner", VerifiedEmail: &email}, nil
}

type bearerTransport struct{ base http.RoundTripper }

func (transport bearerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	clone := request.Clone(request.Context())
	clone.Header = request.Header.Clone()
	clone.Header.Set("Authorization", "Bearer local-owner")
	return transport.base.RoundTrip(clone)
}
func TestRealSDKHTTPRequestsUseCurrentCallerAndRoles(t *testing.T) {
	f := identityDatabase(t)
	ctx := context.Background()
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	sessions := auth.Sessions{Verifier: identityVerifier{}, Resolve: f.service.Resolve, Location: time.UTC}
	host := httptest.NewServer(mcpapi.Handler(server, sessions, config.Config{
		MCPAudience: "http://localhost/mcp",
		Issuer:      "https://issuer.test/",
	}, objectstore.NewTransferGate()))
	defer host.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "identity-http-parity", Version: "1"}, nil).Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint: host.URL,
		HTTPClient: &http.Client{
			Transport: bearerTransport{host.Client().Transport},
			Timeout:   5 * time.Second,
		},
		DisableStandaloneSSE: true,
		MaxRetries:           -1,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	result, err := client.CallTool(ctx, &mcp.CallToolParams{Name: "get_me"})
	if err != nil || result.IsError {
		t.Fatal("actual caller context did not reach service", err)
	}
	encoded, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	var me mcpapi.Envelope[Me, IdentityFailureBody]
	if json.Unmarshal(encoded, &me) != nil || me.Data == nil || me.Data.UserID != f.owner.UserID || !me.Data.Administrator {
		t.Fatal("wrong human identity")
	}
	if _, err := f.service.ApproveUser(ctx, f.owner, ApproveInput{
		Email:          "other-admin@example.test",
		DisplayName:    "Other Admin",
		Administrator:  true,
		RetryReference: command.NewID[command.EventKind]().String(),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.UpdateUser(ctx, f.owner, UpdateUserInput{
		UserID:           f.owner.UserID,
		ExpectedRevision: 1,
		Email:            "owner@example.test",
		DisplayName:      "Owner",
		Active:           true,
		Administrator:    false,
		RetryReference:   command.NewID[command.EventKind]().String(),
	}); err != nil {
		t.Fatal(err)
	}
	result, err = client.CallTool(ctx, &mcp.CallToolParams{Name: "list_users"})
	if err != nil || !result.IsError {
		t.Fatal("MCP reused stale Administrator authority", err)
	}
	encoded, _ = json.Marshal(result.StructuredContent)
	var failure mcpapi.Envelope[command.Page[UserView], IdentityFailureBody]
	if json.Unmarshal(encoded, &failure) != nil || failure.Error == nil || failure.Error.Error.Code != command.Forbidden {
		t.Fatal("role denial is not a typed failure")
	}
}
