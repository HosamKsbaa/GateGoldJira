package mcpclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/mcptokens"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testapp"
	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestLocalBrowserOAuthWithOfficialReferenceClient(t *testing.T) {
	r := testapp.NewRuntime(t)
	r.EnableLocalBrowserOAuth(t)
	fetch := func(ctx context.Context, args *auth.AuthorizationArgs) (*auth.AuthorizationResult, error) {
		browser := http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		response, err := browser.Get(args.URL)
		if err != nil {
			return nil, err
		}
		response.Body.Close()
		if response.StatusCode != 302 {
			return nil, fmt.Errorf("authorization status %d", response.StatusCode)
		}
		target, err := url.Parse(response.Header.Get("Location"))
		if err != nil {
			return nil, err
		}
		body := bytes.NewBufferString(`{"allow":true}`)
		request, err := http.NewRequestWithContext(ctx, "POST", r.URL+"/api/v1/me/mcp-authorizations/"+target.Query().Get("request"), body)
		if err != nil {
			return nil, err
		}
		request.Header.Set("Authorization", "Bearer "+r.Token(t, r.Admin, command.REST))
		request.Header.Set("Content-Type", "application/json")
		response, err = browser.Do(request)
		if err != nil {
			return nil, err
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return nil, fmt.Errorf("consent status %d", response.StatusCode)
		}
		var redirect mcptokens.OAuthRedirect
		if err := json.NewDecoder(response.Body).Decode(&redirect); err != nil {
			return nil, err
		}
		callback, err := url.Parse(redirect.RedirectURL)
		if err != nil {
			return nil, err
		}
		values := callback.Query()
		return &auth.AuthorizationResult{Code: values.Get("code"), State: values.Get("state"), Iss: values.Get("iss")}, nil
	}
	client, err := NewReferenceClient(ReferenceConfig{Endpoint: r.URL + "/mcp", Issuer: r.URL + "/oauth", ClientID: mcptokens.OAuthClientID, RedirectURL: r.URL + "/oauth/callback", ProtocolVersion: "2025-11-25", FetchCode: fetch, HTTPClient: &http.Client{Timeout: 15 * time.Second}})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	session, err := client.Connect(ctx)
	if err != nil {
		t.Fatal("real SDK browser OAuth connection", err)
	}
	defer session.Close()
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_me", Arguments: struct{}{}})
	if err != nil || result.IsError {
		t.Fatal("OAuth tool call failed", err)
	}
	encoded, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(encoded, []byte(r.Admin.String())) {
		t.Fatal("SDK connected as wrong user")
	}
}
