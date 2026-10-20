package mcpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/objectstore"
)

type verifier struct{}

func (verifier) Verify(_ context.Context, header string, channel command.Channel) (command.ProviderIdentity, error) {
	if header != "Bearer mcp" || channel != command.MCP {
		return command.ProviderIdentity{}, errors.New("wrong audience")
	}
	return command.ProviderIdentity{Issuer: "http://test/", Subject: "human"}, nil
}
func TestHTTPStatelessProtocolsSchemasAndResultBranches(t *testing.T) {
	sessions := auth.Sessions{Verifier: verifier{}, Location: time.UTC, Resolve: func(context.Context, command.ProviderIdentity) (command.UserID, error) {
		return command.NewID[command.UserKind](), nil
	}}
	settings := config.Config{
		MCPAudience:   "http://localhost:8080/mcp",
		Issuer:        "https://issuer.test/",
		RequiredScope: "gategoldjira:access",
	}
	server := New()
	type input struct {
		Title    string                `json:"title" minLength:"1" maxLength:"200"`
		Fail     bool                  `json:"fail"`
		Date     *command.CalendarDate `json:"date,omitempty"`
		Revision *command.Revision     `json:"revision,omitempty"`
	}
	type output struct {
		Title string `json:"title"`
	}
	serviceCalls := 0
	var decodedDate string
	var decodedRevision command.Revision
	if err := Register(server, ToolOptions{
		Operation:   command.GetMe,
		Description: "Test transport",
	}, func(_ context.Context, in input) (output, error) {
		serviceCalls++
		if in.Date != nil {
			decodedDate = in.Date.String()
		}
		if in.Revision != nil {
			decodedRevision = *in.Revision
		}
		if in.Fail {
			return output{}, &command.Failure{
				Code:        command.Forbidden,
				Message:     "Not permitted.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.None,
			}
		}
		return output{in.Title}, nil
	}); err != nil {
		t.Fatal(err)
	}
	handler := Handler(server, sessions, settings, objectstore.NewTransferGate())
	request := func(token, body, version string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "http://localhost:8080/mcp", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Accept", "application/json, text/event-stream")
		r.Header.Set("MCP-Protocol-Version", version)
		if version == "2026-07-28" {
			r.Header.Set("Mcp-Method", "server/discover")
		}
		r.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	for _, version := range []string{"2025-11-25", "2026-07-28"} {
		body := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"` + version + `","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}`
		if version == "2026-07-28" {
			body = `{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1"}}}}`
		}
		w := request("Bearer mcp", body, version)
		if w.Code != 200 || w.Header().Get("Mcp-Session-Id") != "" {
			t.Fatalf("stateless init %s: %d %s", version, w.Code, w.Body.String())
		}
	}
	for _, body := range []string{
		`{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_me","arguments":{"title":"مرحبا","fail":false}}}`,
	} {
		w := request("Bearer mcp", body, "2025-11-25")
		if w.Code != 200 {
			t.Fatalf("call without session: %d %s", w.Code, w.Body.String())
		}
	}
	// Text-only clients must receive the same identity/project data as clients
	// that consume structuredContent, including unmodified Arabic values.
	w := request("Bearer mcp", `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_me","arguments":{"title":"مرحبا","fail":false}}}`, "2025-11-25")
	var success struct {
		Result struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
			Structured Result[output] `json:"structuredContent"`
		} `json:"result"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &success); err != nil {
		t.Fatal(err)
	}
	if len(success.Result.Content) != 1 || success.Result.Content[0].Type != "text" {
		t.Fatal("ordinary result is missing its text fallback")
	}
	var text Result[output]
	if err := json.Unmarshal([]byte(success.Result.Content[0].Text), &text); err != nil {
		t.Fatal("text-only clients cannot read the result", err)
	}
	if !text.OK || text.Data == nil || text.Data.Title != "مرحبا" || success.Result.Structured.Data == nil || *text.Data != *success.Result.Structured.Data {
		t.Fatal("text fallback does not match the structured result")
	}
	for _, args := range []string{
		`{"title":"valid","fail":true}`,
		`{"title":"valid","fail":false,"unknown":"secret"}`,
		`{"title":"","fail":false}`,
		// These strings satisfy the JSON schema shape but fail domain decoding.
		`{"title":"valid","fail":false,"date":"2027-02-30"}`,
		`{"title":"valid","fail":false,"revision":"9223372036854775808"}`,
	} {
		before := serviceCalls
		w := request("Bearer mcp", `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_me","arguments":`+args+`}}`, "2025-11-25")
		var envelope struct {
			Result struct {
				IsError    bool           `json:"isError"`
				Structured Result[output] `json:"structuredContent"`
			} `json:"result"`
		}
		if json.Unmarshal(w.Body.Bytes(), &envelope) != nil || !envelope.Result.IsError || envelope.Result.Structured.OK || envelope.Result.Structured.Error == nil {
			t.Fatalf("failure branch: %s", w.Body.String())
		}
		if strings.Contains(w.Body.String(), "secret") {
			t.Fatal("raw input leaked")
		}
		if strings.Contains(w.Body.String(), "2027-02-30") || strings.Contains(w.Body.String(), "9223372036854775808") {
			t.Fatal("domain decoder input leaked into the error response")
		}
		if !strings.Contains(args, `"fail":true`) && serviceCalls != before {
			t.Fatal("invalid transport arguments reached the service")
		}
	}
	w = request("Bearer mcp", `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_me","arguments":{"title":"valid domain values","fail":false,"date":"2028-02-29","revision":"9223372036854775807"}}}`, "2025-11-25")
	if w.Code != 200 || decodedDate != "2028-02-29" || decodedRevision != command.Revision(9223372036854775807) {
		t.Fatal("valid leap date or maximum bigint revision did not reach the typed service")
	}
	for _, token := range []string{"", "Bearer web"} {
		w := request(token, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, "2025-11-25")
		if w.Code != 401 || !strings.Contains(w.Header().Get("WWW-Authenticate"), "resource_metadata") {
			t.Fatal("unauthenticated discovery allowed")
		}
	}
	// Each instance has no session or caller cache; current resolver runs anew.
	gate := objectstore.NewTransferGate()
	release1, _ := gate.Acquire(context.Background())
	defer release1()
	release2, _ := gate.Acquire(context.Background())
	defer release2()
	busy := Handler(server, sessions, settings, gate)
	r := httptest.NewRequest("POST", "http://localhost:8080/mcp", strings.NewReader("not decoded"))
	r.Header.Set("Authorization", "Bearer mcp")
	r.ContentLength = -1
	w = httptest.NewRecorder()
	busy.ServeHTTP(w, r)
	if w.Code != 503 {
		t.Fatal("unknown body did not reserve before decode")
	}
}
