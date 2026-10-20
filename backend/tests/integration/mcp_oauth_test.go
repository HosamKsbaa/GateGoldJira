package integration

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"

	"gategoldjira/backend/internal/features/mcptokens"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
)

const oauthClient = "gategoldjira-antigravity"
const verifierValue = "abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDE"

func authorizationURL(r *testapp.Runtime, verifier string) string {
	challenge := sha256.Sum256([]byte(verifier))
	return r.URL + "/oauth/authorize?" + url.Values{"client_id": {oauthClient}, "response_type": {"code"}, "scope": {"gategoldjira:access"}, "resource": {r.URL + "/mcp"}, "redirect_uri": {r.URL + "/oauth/callback"}, "state": {"private-state"}, "code_challenge": {base64.RawURLEncoding.EncodeToString(challenge[:])}, "code_challenge_method": {"S256"}}.Encode()
}
func beginAuthorization(t *testing.T, r *testapp.Runtime) string {
	t.Helper()
	client := http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Get(authorizationURL(r, verifierValue))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 302 {
		t.Fatal("authorization did not require browser consent", response.StatusCode)
	}
	target, err := url.Parse(response.Header.Get("Location"))
	if err != nil || target.Path != "/account/mcp-authorize" {
		t.Fatal("wrong consent destination")
	}
	return target.Query().Get("request")
}
func approveOAuth(t *testing.T, r *testapp.Runtime, user command.UserID, request string, allow bool) url.Values {
	t.Helper()
	path := r.URL + "/api/v1/me/mcp-authorizations/" + request
	if status, _ := personalRequest(t, "GET", path, "", nil); status != 401 {
		t.Fatal("unauthenticated consent was accepted")
	}
	status, body := personalRequest(t, "GET", path, r.Token(t, user, command.REST), nil)
	if status != 200 {
		t.Fatal("consent preview", status)
	}
	status, body = personalRequest(t, "POST", path, r.Token(t, user, command.REST), map[string]bool{"allow": allow})
	var result mcptokens.OAuthRedirect
	if status != 200 || json.Unmarshal(body, &result) != nil {
		t.Fatal("consent failed", status)
	}
	callback, err := url.Parse(result.RedirectURL)
	if err != nil {
		t.Fatal(err)
	}
	values := callback.Query()
	if values.Get("state") != "private-state" || values.Get("iss") != r.URL+"/oauth" {
		t.Fatal("callback lost state/issuer")
	}
	if status, _ := personalRequest(t, "POST", path, r.Token(t, user, command.REST), map[string]bool{"allow": true}); status != 404 {
		t.Fatal("consent was replayed", status)
	}
	return values
}
func exchange(t *testing.T, r *testapp.Runtime, form url.Values) (int, []byte) {
	t.Helper()
	response, err := http.PostForm(r.URL+"/oauth/token", form)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("OAuth response can be cached")
	}
	return response.StatusCode, body
}
func codeForm(r *testapp.Runtime, code, verifier string) url.Values {
	return url.Values{"grant_type": {"authorization_code"}, "client_id": {oauthClient}, "resource": {r.URL + "/mcp"}, "code": {code}, "code_verifier": {verifier}, "redirect_uri": {r.URL + "/oauth/callback"}}
}

type oauthTokens struct {
	Access  string `json:"access_token"`
	Refresh string `json:"refresh_token"`
	Expires int    `json:"expires_in"`
}

func decodedTokens(t *testing.T, status int, body []byte) oauthTokens {
	t.Helper()
	var tokens oauthTokens
	if status != 200 || json.Unmarshal(body, &tokens) != nil || !strings.HasPrefix(tokens.Access, "gg_oauth_") || tokens.Refresh == "" || tokens.Expires != 900 {
		t.Fatal("OAuth exchange failed", status)
	}
	return tokens
}

func TestMCPBrowserOAuthConsentPKCERefreshPersistenceAuditAndRevocation(t *testing.T) {
	r := testapp.NewRuntime(t)
	r.EnableLocalBrowserOAuth(t)
	ctx := context.Background()
	response, err := http.Get(r.URL + "/.well-known/oauth-protected-resource/mcp")
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if !bytes.Contains(data, []byte(r.URL+"/oauth")) {
		t.Fatal("unreachable legacy issuer advertised")
	}
	response, err = http.Get(r.URL + "/.well-known/oauth-authorization-server/oauth")
	if err != nil {
		t.Fatal(err)
	}
	data, _ = io.ReadAll(response.Body)
	response.Body.Close()
	if !bytes.Contains(data, []byte(`"S256"`)) || !bytes.Contains(data, []byte(`"refresh_token"`)) {
		t.Fatal("OAuth discovery incomplete")
	}
	request := beginAuthorization(t, r)
	code := approveOAuth(t, r, r.Member, request, true).Get("code")
	// Wrong verifier, client, callback and resource never mint credentials or consume a valid code.
	for _, field := range []string{"code_verifier", "client_id", "redirect_uri", "resource"} {
		form := codeForm(r, code, verifierValue)
		form.Set(field, "wrong")
		if status, _ := exchange(t, r, form); status == 200 {
			t.Fatal("OAuth binding ignored", field)
		}
	}
	tokens := exchangeTokens(t, r, codeForm(r, code, verifierValue))
	if status, _ := exchange(t, r, codeForm(r, code, verifierValue)); status == 200 {
		t.Fatal("one-use code replayed")
	}
	if status, body := personalMCP(t, r, tokens.Access, "get_me", struct{}{}); status != 200 || !bytes.Contains(body, []byte(r.Member.String())) {
		t.Fatal("OAuth not attributed to approving user", status)
	}
	if status, _ := personalRequest(t, "GET", r.URL+"/api/v1/me", tokens.Access, nil); status != 401 {
		t.Fatal("MCP credential used on REST")
	}
	var connection uuid.UUID
	if err := r.Pool.QueryRow(ctx, "SELECT id FROM personal_mcp_tokens WHERE user_id=$1 AND kind='oauth'", r.Member.UUID).Scan(&connection); err != nil {
		t.Fatal(err)
	}
	history := tokenActivity(t, r, r.Member, connection, nil)
	if len(history.Items) != 1 || history.Items[0].ToolName != "get_me" {
		t.Fatal("OAuth calls not logged per connection")
	}
	r.Restart(t)
	if status, _ := personalMCP(t, r, tokens.Access, "get_me", struct{}{}); status != 200 {
		t.Fatal("OAuth connection did not survive restart")
	}
	form := url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthClient}, "resource": {r.URL + "/mcp"}, "refresh_token": {tokens.Refresh}}
	refreshed := exchangeTokens(t, r, form)
	if refreshed.Refresh == tokens.Refresh || refreshed.Access == tokens.Access {
		t.Fatal("refresh did not rotate credentials")
	}
	if status, _ := personalMCP(t, r, tokens.Access, "get_me", struct{}{}); status != 401 {
		t.Fatal("old access token survived rotation")
	}
	if status, _ := personalMCP(t, r, refreshed.Access, "get_me", struct{}{}); status != 200 {
		t.Fatal("refreshed token rejected")
	}
	// Reusing a consumed refresh credential revokes its connection family.
	if status, _ := exchange(t, r, form); status == 200 {
		t.Fatal("refresh replay accepted")
	}
	if status, _ := personalMCP(t, r, refreshed.Access, "get_me", struct{}{}); status != 401 {
		t.Fatal("refresh replay did not revoke family")
	}
	// A separate connection can be revoked through the existing owner-only settings.
	code = approveOAuth(t, r, r.Member, beginAuthorization(t, r), true).Get("code")
	second := exchangeTokens(t, r, codeForm(r, code, verifierValue))
	if err := r.Pool.QueryRow(ctx, "SELECT id FROM personal_mcp_tokens WHERE user_id=$1 AND kind='oauth' AND revoked_at IS NULL", r.Member.UUID).Scan(&connection); err != nil {
		t.Fatal(err)
	}
	if status, _ := personalRequest(t, "POST", r.URL+"/api/v1/me/mcp-tokens/"+connection.String()+"/revoke", r.Token(t, r.Member, command.REST), struct{}{}); status != 200 {
		t.Fatal("OAuth connection revoke failed", status)
	}
	if status, _ := personalMCP(t, r, second.Access, "get_me", struct{}{}); status != 401 {
		t.Fatal("revoked OAuth access accepted")
	}
	form.Set("refresh_token", second.Refresh)
	if status, _ := exchange(t, r, form); status == 200 {
		t.Fatal("revoked OAuth refresh accepted")
	}
	var persisted string
	if err := r.Pool.QueryRow(ctx, "SELECT coalesce(json_agg(c)::text,'') FROM mcp_oauth_credentials c").Scan(&persisted); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{code, tokens.Access, tokens.Refresh, second.Access, second.Refresh} {
		if strings.Contains(persisted, secret) {
			t.Fatal("OAuth credential stored in plaintext")
		}
	}
	denial := approveOAuth(t, r, r.Viewer, beginAuthorization(t, r), false)
	if denial.Get("error") != "access_denied" || denial.Get("code") != "" {
		t.Fatal("denial issued code")
	}
}

func TestMCPBrowserOAuthRejectsBadAuthorizationAndConcurrentCodeReuse(t *testing.T) {
	r := testapp.NewRuntime(t)
	r.EnableLocalBrowserOAuth(t)
	client := http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for field, value := range map[string]string{"redirect_uri": "https://attacker.test/callback", "code_challenge_method": "plain", "resource": r.URL + "/api", "client_id": "unknown", "state": ""} {
		address, _ := url.Parse(authorizationURL(r, verifierValue))
		query := address.Query()
		query.Set(field, value)
		address.RawQuery = query.Encode()
		response, err := client.Get(address.String())
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != 400 || response.Header.Get("Location") != "" {
			t.Fatal("unsafe authorization redirect", field)
		}
	}
	code := approveOAuth(t, r, r.Admin, beginAuthorization(t, r), true).Get("code")
	var group sync.WaitGroup
	statuses := make(chan int, 2)
	for range 2 {
		group.Go(func() { status, _ := exchange(t, r, codeForm(r, code, verifierValue)); statuses <- status })
	}
	group.Wait()
	close(statuses)
	successes := 0
	for status := range statuses {
		if status == 200 {
			successes++
		}
	}
	if successes != 1 {
		t.Fatal("concurrent one-use code was replayed", successes)
	}
}

func exchangeTokens(t *testing.T, r *testapp.Runtime, form url.Values) oauthTokens {
	t.Helper()
	status, body := exchange(t, r, form)
	return decodedTokens(t, status, body)
}

func TestMCPBrowserOAuthExpiryAccountStatusAndPermissions(t *testing.T) {
	r := testapp.NewRuntime(t)
	response, err := http.Get(r.URL + "/oauth/authorize")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 404 {
		t.Fatal("local OAuth registered outside explicit development")
	}
	r.EnableLocalBrowserOAuth(t)
	code := approveOAuth(t, r, r.Viewer, beginAuthorization(t, r), true).Get("code")
	tokens := exchangeTokens(t, r, codeForm(r, code, verifierValue))
	status, body := personalMCP(t, r, tokens.Access, "create_project", map[string]string{"key": "NOAUTH", "name": "Denied", "retryReference": uuid.NewString()})
	if status != 200 || !bytes.Contains(body, []byte(`"isError":true`)) {
		t.Fatal("OAuth elevated viewer permissions")
	}
	ctx := context.Background()
	if _, err := r.Pool.Exec(ctx, "UPDATE mcp_oauth_credentials SET access_expires_at=now()-interval '1 second' WHERE access_hash=$1", hashCredentialForTest(tokens.Access)); err != nil {
		t.Fatal(err)
	}
	if status, _ := personalMCP(t, r, tokens.Access, "get_me", struct{}{}); status != 401 {
		t.Fatal("expired OAuth access accepted")
	}
	form := url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthClient}, "resource": {r.URL + "/mcp"}, "refresh_token": {tokens.Refresh}}
	tokens = exchangeTokens(t, r, form)
	if _, err := r.Pool.Exec(ctx, "UPDATE users SET disabled_at=now(),revision=revision+1 WHERE id=$1", r.Viewer.UUID); err != nil {
		t.Fatal(err)
	}
	if status, _ := personalMCP(t, r, tokens.Access, "get_me", struct{}{}); status != 401 {
		t.Fatal("disabled account OAuth access accepted")
	}
	form.Set("refresh_token", tokens.Refresh)
	if status, _ := exchange(t, r, form); status == 200 {
		t.Fatal("disabled account refresh accepted")
	}
	code = approveOAuth(t, r, r.Member, beginAuthorization(t, r), true).Get("code")
	if _, err := r.Pool.Exec(ctx, "UPDATE mcp_oauth_credentials SET metadata=jsonb_set(metadata,'{CodeExpiresIn}','1') WHERE code_hash=$1", hashCredentialForTest(code)); err != nil {
		t.Fatal(err)
	}
	if status, _ := exchange(t, r, codeForm(r, code, verifierValue)); status == 200 {
		t.Fatal("expired code accepted")
	}
	pending := beginAuthorization(t, r)
	if _, err := r.Pool.Exec(ctx, "UPDATE mcp_oauth_authorizations SET expires_at=now()-interval '1 second' WHERE request_hash=$1", hashCredentialForTest(pending)); err != nil {
		t.Fatal(err)
	}
	if status, _ := personalRequest(t, "GET", r.URL+"/api/v1/me/mcp-authorizations/"+pending, r.Token(t, r.Member, command.REST), nil); status != 404 {
		t.Fatal("expired consent request accepted")
	}
}
func hashCredentialForTest(value string) []byte { sum := sha256.Sum256([]byte(value)); return sum[:] }
