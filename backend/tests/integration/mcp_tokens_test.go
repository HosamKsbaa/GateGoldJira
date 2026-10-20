package integration

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"

	"gategoldjira/backend/internal/features/mcptokens"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
)

func personalRequest(t *testing.T, method, address, token string, body any) (int, []byte) {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(method, address, bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json, text/event-stream")
	request.Header.Set("MCP-Protocol-Version", "2025-11-25")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(address, "/me/mcp-tokens") && response.StatusCode < 300 && response.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("credential response may be cached")
	}
	return response.StatusCode, data
}

func mintPersonal(t *testing.T, r *testapp.Runtime, user command.UserID, name string) mcptokens.CreatedToken {
	t.Helper()
	status, body := personalRequest(t, "POST", r.URL+"/api/v1/me/mcp-tokens", r.Token(t, user, command.REST), mcptokens.CreateInput{Name: name})
	var result mcptokens.CreatedToken
	if status != 201 || json.Unmarshal(body, &result) != nil || result.Token == "" {
		t.Fatal("personal token creation failed", status)
	}
	return result
}

func personalMCP(t *testing.T, r *testapp.Runtime, token, name string, args any) (int, []byte) {
	t.Helper()
	return personalRequest(t, "POST", r.URL+"/mcp", token, map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": map[string]any{"name": name, "arguments": args}})
}

func TestPersonalMCPTokenOwnershipAuthenticationAndRevocation(t *testing.T) {
	r := testapp.NewRuntime(t)
	ctx := context.Background()
	member := mintPersonal(t, r, r.Member, "My Antigravity")
	viewer := mintPersonal(t, r, r.Viewer, "Viewer laptop")
	owner := mintPersonal(t, r, r.Admin, "Owner laptop")
	writeStatus, writeBody := personalMCP(t, r, owner.Token, "create_project", map[string]string{"key": "TOKEN", "name": "Created with a personal token", "retryReference": uuid.NewString()})
	var saved struct {
		Result struct {
			StructuredContent struct {
				OK   bool `json:"ok"`
				Data struct {
					Receipt struct {
						EventID string `json:"eventId"`
					} `json:"receipt"`
				} `json:"data"`
			} `json:"structuredContent"`
		} `json:"result"`
	}
	if writeStatus != 200 || json.Unmarshal(writeBody, &saved) != nil || !saved.Result.StructuredContent.OK {
		t.Fatal("personal token could not perform an authorized write", writeStatus)
	}
	var eventActor uuid.UUID
	var channel string
	if err := r.Pool.QueryRow(ctx, "SELECT actor_id,channel FROM activity_events WHERE id=$1", saved.Result.StructuredContent.Data.Receipt.EventID).Scan(&eventActor, &channel); err != nil {
		t.Fatal(err)
	}
	if eventActor != r.Admin.UUID || channel != "mcp" {
		t.Fatal("personal-token write was not attributed to its owner")
	}
	for _, account := range []struct {
		id    command.UserID
		token mcptokens.CreatedToken
	}{{r.Member, member}, {r.Viewer, viewer}, {r.Admin, owner}} {
		status, body := personalMCP(t, r, account.token.Token, "get_me", struct{}{})
		var envelope struct {
			Result struct {
				StructuredContent struct {
					OK   bool `json:"ok"`
					Data struct {
						UserID command.UserID `json:"userId"`
					} `json:"data"`
				} `json:"structuredContent"`
			} `json:"result"`
		}
		if status != 200 || json.Unmarshal(body, &envelope) != nil || !envelope.Result.StructuredContent.OK || envelope.Result.StructuredContent.Data.UserID != account.id {
			t.Fatal("personal token did not authenticate as its owner", status)
		}
		var hash []byte
		var lastUsed bool
		if err := r.Pool.QueryRow(ctx, "SELECT token_hash,last_used_at IS NOT NULL FROM personal_mcp_tokens WHERE id=$1", account.token.Details.ID).Scan(&hash, &lastUsed); err != nil {
			t.Fatal(err)
		}
		expected := sha256.Sum256([]byte(account.token.Token))
		if !bytes.Equal(hash, expected[:]) || !lastUsed {
			t.Fatal("token must be hashed and usage recorded")
		}
	}
	// Management metadata must never reveal a secret or another user's token.
	status, body := personalRequest(t, "GET", r.URL+"/api/v1/me/mcp-tokens", r.Token(t, r.Member, command.REST), nil)
	var list mcptokens.TokenList
	if status != 200 || json.Unmarshal(body, &list) != nil || len(list.Items) != 1 || list.Items[0].ID != member.Details.ID || bytes.Contains(body, []byte(member.Token)) || bytes.Contains(body, []byte("token_hash")) || bytes.Contains(body, []byte(viewer.Details.ID.String())) {
		t.Fatal("token metadata leaks ownership or secrets")
	}
	// Opaque MCP credentials cannot be used to log into the API or mint tokens.
	for _, path := range []string{"/api/v1/me", "/api/v1/me/mcp-tokens"} {
		if status, _ := personalRequest(t, "GET", r.URL+path, member.Token, nil); status != 401 {
			t.Fatal("MCP token crossed the API boundary", status)
		}
	}
	if status, _ := personalRequest(t, "POST", r.URL+"/api/v1/me/mcp-tokens", member.Token, mcptokens.CreateInput{Name: "Escalation"}); status != 401 {
		t.Fatal("MCP token minted credentials")
	}
	for _, other := range []command.UserID{r.Admin, r.Viewer} {
		status, _ := personalRequest(t, "POST", r.URL+"/api/v1/me/mcp-tokens/"+member.Details.ID.String()+"/revoke", r.Token(t, other, command.REST), struct{}{})
		if status != 404 {
			t.Fatal("another user revoked or discovered a private token", status)
		}
	}
	// Current project membership is rechecked on every MCP operation.
	project := uuid.New()
	if _, err := r.Pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'PAT','Token project',$2)", project, r.Admin.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'member')", project, r.Member.UUID); err != nil {
		t.Fatal(err)
	}
	status, body = personalMCP(t, r, member.Token, "get_project", map[string]string{"projectId": project.String()})
	if status != 200 || !bytes.Contains(body, []byte(`"ok":true`)) {
		t.Fatal("current project read failed")
	}
	if _, err := r.Pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now(),revision=revision+1 WHERE project_id=$1 AND user_id=$2", project, r.Member.UUID); err != nil {
		t.Fatal(err)
	}
	status, body = personalMCP(t, r, member.Token, "get_project", map[string]string{"projectId": project.String()})
	if status != 200 || !bytes.Contains(body, []byte(`"isError":true`)) || bytes.Contains(body, []byte("Token project")) {
		t.Fatal("token retained revoked project access")
	}
	status, body = personalMCP(t, r, viewer.Token, "create_project", map[string]string{"key": "NO", "name": "Forbidden", "retryReference": uuid.NewString()})
	if status != 200 || !bytes.Contains(body, []byte(`"isError":true`)) {
		t.Fatal("viewer token gained administrator rights")
	}
	// Revocation is repeatable, and invalidates the very next request.
	for range 2 {
		status, _ := personalRequest(t, "POST", r.URL+"/api/v1/me/mcp-tokens/"+member.Details.ID.String()+"/revoke", r.Token(t, r.Member, command.REST), struct{}{})
		if status != 200 {
			t.Fatal("owner revoke failed", status)
		}
	}
	if status, _ := personalMCP(t, r, member.Token, "get_me", struct{}{}); status != 401 {
		t.Fatal("revoked token was accepted", status)
	}
	if _, err := r.Pool.Exec(ctx, "UPDATE personal_mcp_tokens SET created_at=now()-interval '31 days',expires_at=now()-interval '1 hour' WHERE id=$1", viewer.Details.ID); err != nil {
		t.Fatal(err)
	}
	if status, _ := personalMCP(t, r, viewer.Token, "get_me", struct{}{}); status != 401 {
		t.Fatal("expired token was accepted")
	}
	if _, err := r.Pool.Exec(ctx, "UPDATE users SET disabled_at=now(),revision=revision+1 WHERE id=$1", r.Admin.UUID); err != nil {
		t.Fatal(err)
	}
	if status, _ := personalMCP(t, r, owner.Token, "get_me", struct{}{}); status != 401 {
		t.Fatal("disabled owner token was accepted")
	}
	if status, _ := personalMCP(t, r, "gg_mcp_"+strings.Repeat("x", 43), "get_me", struct{}{}); status != 401 {
		t.Fatal("unknown token was accepted")
	}
	var receipts int
	if err := r.Pool.QueryRow(ctx, "SELECT count(*) FROM idempotency_records WHERE result::text LIKE '%gg_mcp_%'").Scan(&receipts); err != nil {
		t.Fatal(err)
	}
	if receipts != 0 {
		t.Fatal("credential entered replay storage")
	}
}

func TestPersonalMCPTokenLimitSerializesConcurrentCreation(t *testing.T) {
	r := testapp.NewRuntime(t)
	credential := r.Token(t, r.Viewer, command.REST)
	// Establish the identity before racing credential creation.
	personalRequest(t, "GET", r.URL+"/api/v1/me", credential, nil)
	var group sync.WaitGroup
	statuses := make(chan int, 12)
	for range 12 {
		group.Go(func() {
			status, _ := personalRequest(t, "POST", r.URL+"/api/v1/me/mcp-tokens", credential, mcptokens.CreateInput{Name: "Laptop"})
			statuses <- status
		})
	}
	group.Wait()
	close(statuses)
	created := 0
	for status := range statuses {
		if status == 201 {
			created++
		} else if status != 422 {
			t.Fatal("unexpected create outcome", status)
		}
	}
	if created != mcptokens.ActiveLimit {
		t.Fatal("concurrent creation bypassed account limit", created)
	}
	for _, input := range []mcptokens.CreateInput{{Name: " "}, {Name: ""}, {Name: strings.Repeat("x", 81)}} {
		if status, _ := personalRequest(t, "POST", r.URL+"/api/v1/me/mcp-tokens", r.Token(t, r.Member, command.REST), input); status != 422 {
			t.Fatal("invalid token settings accepted", status)
		}
	}
}

func tokenActivity(t *testing.T, r *testapp.Runtime, user command.UserID, tokenID uuid.UUID, before *string) mcptokens.TokenActivityPage {
	t.Helper()
	address := r.URL + "/api/v1/me/mcp-tokens/" + tokenID.String() + "/activity"
	if before != nil {
		address += "?before=" + *before
	}
	status, body := personalRequest(t, "GET", address, r.Token(t, user, command.REST), nil)
	var page mcptokens.TokenActivityPage
	if status != 200 || json.Unmarshal(body, &page) != nil {
		t.Fatal("activity history unavailable", status)
	}
	return page
}

func TestPersonalMCPTokenPermanentActivityIsolationAndUploadAuthentication(t *testing.T) {
	r := testapp.NewRuntime(t)
	ctx := context.Background()
	member := mintPersonal(t, r, r.Member, "Member client")
	other := mintPersonal(t, r, r.Member, "Other client")
	owner := mintPersonal(t, r, r.Admin, "Owner client")
	if member.Details.ExpiresAt != nil {
		t.Fatal("new personal token expires")
	}
	// Permanent means creation age never expires it.
	if _, err := r.Pool.Exec(ctx, "UPDATE personal_mcp_tokens SET created_at=now()-interval '100 years' WHERE id=$1", member.Details.ID); err != nil {
		t.Fatal(err)
	}
	if status, _ := personalMCP(t, r, member.Token, "get_me", struct{}{}); status != 200 {
		t.Fatal("permanent token expired", status)
	}
	privateArgument := "private-file-content-that-must-not-enter-activity"
	personalMCP(t, r, member.Token, "get_me", map[string]string{"unknown": privateArgument, "credential": member.Token})
	personalMCP(t, r, member.Token, "create_project", map[string]string{"key": "DENIED", "name": privateArgument, "retryReference": uuid.NewString()})
	page := tokenActivity(t, r, r.Member, member.Details.ID, nil)
	if len(page.Items) != 3 {
		t.Fatal("registered calls were not all recorded", len(page.Items))
	}
	codes := map[string]bool{}
	for _, item := range page.Items {
		if item.CompletedAt == nil || item.DurationMS == nil || *item.DurationMS < 0 {
			t.Fatal("call completion missing")
		}
		if item.ErrorCode != nil {
			codes[*item.ErrorCode] = true
		}
	}
	if !codes["validation_failed"] || !codes["forbidden"] {
		t.Fatal("failed calls lack stable error codes", codes)
	}
	if len(tokenActivity(t, r, r.Member, other.Details.ID, nil).Items) != 0 {
		t.Fatal("activity leaked between tokens of the same user")
	}
	for _, user := range []command.UserID{r.Admin, r.Viewer} {
		if status, _ := personalRequest(t, "GET", r.URL+"/api/v1/me/mcp-tokens/"+member.Details.ID.String()+"/activity", r.Token(t, user, command.REST), nil); status != 404 {
			t.Fatal("another account discovered token activity", status)
		}
	}
	// A write and its idempotent replay are distinct calls with the same resource URL.
	input := map[string]string{"key": "LOG", "name": privateArgument, "retryReference": uuid.NewString()}
	for range 2 {
		status, body := personalMCP(t, r, owner.Token, "create_project", input)
		if status != 200 || !bytes.Contains(body, []byte(`"ok":true`)) {
			t.Fatal("authorized write failed", status)
		}
	}
	ownerPage := tokenActivity(t, r, r.Admin, owner.Details.ID, nil)
	if len(ownerPage.Items) != 2 || ownerPage.Items[0].ResourceURL == nil || !strings.Contains(*ownerPage.Items[0].ResourceURL, "/projects/") || *ownerPage.Items[0].ResourceURL != *ownerPage.Items[1].ResourceURL {
		t.Fatal("activity lost created resource link or replay")
	}
	for range 26 {
		personalMCP(t, r, member.Token, "get_me", struct{}{})
	}
	page = tokenActivity(t, r, r.Member, member.Details.ID, nil)
	if len(page.Items) != 25 || page.NextCursor == nil {
		t.Fatal("activity is not bounded")
	}
	older := tokenActivity(t, r, r.Member, member.Details.ID, page.NextCursor)
	if len(older.Items) != 4 || older.NextCursor != nil {
		t.Fatal("activity pagination lost calls", len(older.Items))
	}
	seen := map[uuid.UUID]bool{}
	for _, item := range append(page.Items, older.Items...) {
		if seen[item.ID] {
			t.Fatal("duplicate activity page")
		}
		seen[item.ID] = true
	}
	var serialized string
	if err := r.Pool.QueryRow(ctx, "SELECT json_agg(a)::text FROM personal_mcp_token_activity a").Scan(&serialized); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{member.Token, owner.Token, privateArgument} {
		if strings.Contains(serialized, secret) {
			t.Fatal("private content entered activity storage")
		}
	}
	for _, tool := range []string{"upload_picture", "upload_attachment", "upload_asset", "start_asset_upload", "append_asset_chunk", "finalize_asset_upload"} {
		if status, _ := personalMCP(t, r, "", tool, struct{}{}); status != 401 {
			t.Fatal("upload accepted without authorization", tool, status)
		}
	}
	personalRequest(t, "POST", r.URL+"/api/v1/me/mcp-tokens/"+member.Details.ID.String()+"/revoke", r.Token(t, r.Member, command.REST), struct{}{})
	for _, tool := range []string{"upload_picture", "upload_attachment", "upload_asset", "start_asset_upload", "append_asset_chunk", "finalize_asset_upload"} {
		if status, _ := personalMCP(t, r, member.Token, tool, struct{}{}); status != 401 {
			t.Fatal("upload accepted with revoked token", tool, status)
		}
	}
	if len(tokenActivity(t, r, r.Member, member.Details.ID, nil).Items) != 25 {
		t.Fatal("revoking token erased its activity")
	}
	if status, _ := personalRequest(t, "GET", r.URL+"/api/v1/me/mcp-tokens/"+member.Details.ID.String()+"/activity?before=invalid", r.Token(t, r.Member, command.REST), nil); status != 422 {
		t.Fatal("invalid cursor accepted", status)
	}
}
