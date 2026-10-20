package mcpclient

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestRegisteredPublicOAuthDiscoveryAndStatelessVersions(t *testing.T) {
	f := newFixture(t)
	for _, version := range []string{"2025-11-25", "2026-07-28"} {
		t.Run(version, func(t *testing.T) {
			client, err := NewReferenceClient(ReferenceConfig{
				Endpoint:        f.endpoint,
				Issuer:          f.issuer.URL + "/",
				ClientID:        publicClient,
				RedirectURL:     redirectURI,
				ProtocolVersion: version,
				FetchCode:       f.fetchCode(t),
				HTTPClient:      f.httpClient,
			})
			if err != nil {
				t.Fatal(err)
			}
			session, err := client.Connect(context.Background())
			if err != nil {
				t.Fatal("OAuth connection", err)
			}
			defer session.Close()
			var tools []*mcp.Tool
			var cursor string
			for {
				list, listErr := session.ListTools(context.Background(), &mcp.ListToolsParams{Cursor: cursor})
				if listErr != nil {
					t.Fatal("real catalog", listErr)
				}
				tools = append(tools, list.Tools...)
				if list.NextCursor == "" {
					break
				}
				cursor = list.NextCursor
			}
			if len(tools) != 133 {
				t.Fatal("real catalog count", len(tools))
			}
			result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "get_me", Arguments: struct{}{}})
			if err != nil || result.IsError {
				t.Fatal("real identity read", err)
			}
			validateResultSchema(t, session, "get_me", result)
			data, _ := json.Marshal(result.StructuredContent)
			var out mcpapi.Result[identity.Me]
			if json.Unmarshal(data, &out) != nil || !out.OK || out.Data == nil || out.Data.UserID != f.admin {
				t.Fatal("identity envelope")
			}
			// Switch only this fixture's concrete handler to another independently wired
			// application; no MCP session or caller cache is carried between instances.
			f.restart(t)
			result, err = session.CallTool(context.Background(), &mcp.CallToolParams{Name: "get_me", Arguments: struct{}{}})
			if err != nil || result.IsError {
				t.Fatal("stateless instance switch", err)
			}
			result, err = session.CallTool(context.Background(), &mcp.CallToolParams{
				Name: "get_me",
				Arguments: map[string]string{
					"callerId": f.admin.String(),
					"token":    "never-echo-this",
				},
			})
			if err != nil || !result.IsError {
				t.Fatal("caller injection accepted", err)
			}
			validateResultSchema(t, session, "get_me", result)
			data, _ = json.Marshal(result.StructuredContent)
			if strings.Contains(string(data), "never-echo-this") {
				t.Fatal("input secret echoed")
			}
			var failure mcpapi.Result[identity.Me]
			if json.Unmarshal(data, &failure) != nil || failure.OK || failure.Data != nil || failure.Error == nil || failure.Error.Error.Code != "validation_failed" {
				t.Fatal("invalid typed branch", string(data))
			}
		})
	}
	if f.authorizations.Load() != 2 || f.exchanges.Load() != 2 || f.metadataReads.Load() < 2 || f.discoveryReads.Load() < 2 {
		t.Fatal("discovery/PKCE exchange not exercised")
	}
}
func TestHTTPAuthAndProtocolFailuresAreSeparateFromToolErrors(t *testing.T) {
	f := newFixture(t)
	for _, token := range []string{"", f.accessToken(t, "web"), "invalid"} {
		resp := f.raw(t, token, "2025-11-25", `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`)
		if resp.StatusCode != 401 || !strings.Contains(resp.Header.Get("WWW-Authenticate"), "resource_metadata") {
			t.Fatal("wrong audience accepted", resp.StatusCode)
		}
		resp.Body.Close()
	}
	resp := f.raw(t, f.accessToken(t, "mcp"), "2099-01-01", `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`)
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		t.Fatal("protocol error confused with auth")
	}
	if resp.StatusCode == 200 {
		t.Fatal("undeclared version accepted")
	}
	resp = f.raw(t, f.accessToken(t, "mcp"), "2025-11-25", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_issue","arguments":{"issueId":"30000000-0000-4000-8000-000000000099"}}}`)
	defer resp.Body.Close()
	var out struct {
		Result struct {
			IsError    bool                                                  `json:"isError"`
			Structured mcpapi.Envelope[json.RawMessage, httpapi.FailureBody] `json:"structuredContent"`
		} `json:"result"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(resp.Body).Decode(&out) != nil || !out.Result.IsError || out.Result.Structured.Error == nil || out.Result.Structured.Error.Error.Code != "unavailable_record" {
		t.Fatal("business failure did not stay in tools envelope")
	}
}

func TestOAuthRejectsChangedStateIssuerAndUnregisteredRedirect(t *testing.T) {
	for _, kind := range []string{"state", "issuer", "redirect"} {
		t.Run(kind, func(t *testing.T) {
			f := newFixture(t)
			fetch := f.fetchCode(t)
			redirect := redirectURI
			if kind == "redirect" {
				redirect = "http://127.0.0.1:39177/other-callback"
			}
			wrapped := func(ctx context.Context, args *auth.AuthorizationArgs) (*auth.AuthorizationResult, error) {
				result, err := fetch(ctx, args)
				if err != nil {
					return nil, err
				}
				if kind == "state" {
					result.State = "changed"
				}
				if kind == "issuer" {
					result.Iss = "https://foreign-issuer.example/"
				}
				return result, nil
			}
			client, err := NewReferenceClient(ReferenceConfig{
				Endpoint:        f.endpoint,
				Issuer:          f.issuer.URL + "/",
				ClientID:        publicClient,
				RedirectURL:     redirect,
				ProtocolVersion: "2026-07-28",
				FetchCode:       wrapped,
				HTTPClient:      f.httpClient,
			})
			if err != nil {
				t.Fatal(err)
			}
			session, err := client.Connect(context.Background())
			if err == nil {
				session.Close()
				t.Fatal("invalid authorization accepted")
			}
			if f.exchanges.Load() != 0 {
				t.Fatal("invalid response reached token exchange")
			}
		})
	}
}

func validateResultSchema(t *testing.T, session *mcp.ClientSession, name string, result *mcp.CallToolResult) {
	t.Helper()
	catalog, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, tool := range catalog.Tools {
		if tool.Name != name {
			continue
		}
		encoded, err := json.Marshal(tool.OutputSchema)
		if err != nil {
			t.Fatal(err)
		}
		var schema jsonschema.Schema
		if json.Unmarshal(encoded, &schema) != nil {
			t.Fatal("invalid output schema")
		}
		resolved, err := schema.Resolve(nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := resolved.Validate(result.StructuredContent); err != nil {
			t.Fatal("result does not satisfy published output schema", err)
		}
		return
	}
	t.Fatal("missing result schema")
}
