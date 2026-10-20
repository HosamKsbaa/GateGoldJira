package integration

import (
	"net/http"
	"net/url"
	"testing"

	"gategoldjira/backend/tests/testapp"
)

func TestMCPPluginOAuthDisconnectRevokesOnlyItsOwnConnection(t *testing.T) {
	r := testapp.NewRuntime(t)
	r.EnableLocalBrowserOAuth(t)
	member := exchangeTokens(t, r, codeForm(r, approveOAuth(t, r, r.Member, beginAuthorization(t, r), true).Get("code"), verifierValue))
	owner := exchangeTokens(t, r, codeForm(r, approveOAuth(t, r, r.Admin, beginAuthorization(t, r), true).Get("code"), verifierValue))
	revoke := func(token, client string, expected int) {
		t.Helper()
		response, err := http.PostForm(r.URL+"/oauth/revoke", url.Values{"client_id": {client}, "token": {token}, "token_type_hint": {"refresh_token"}})
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != expected || response.Header.Get("Cache-Control") != "no-store" {
			t.Fatal("unexpected revocation response", response.StatusCode)
		}
	}
	revoke(member.Refresh, "unregistered-client", 401)
	if status, _ := personalMCP(t, r, member.Access, "get_me", struct{}{}); status != 200 {
		t.Fatal("invalid client revoked a connection", status)
	}
	revoke(member.Refresh, oauthClient, 200)
	revoke(member.Refresh, oauthClient, 200)
	revoke("unknown-credential", oauthClient, 200)
	if status, _ := personalMCP(t, r, member.Access, "get_me", struct{}{}); status != 401 {
		t.Fatal("disconnected access still works", status)
	}
	if status, _ := exchange(t, r, url.Values{"client_id": {oauthClient}, "resource": {r.URL + "/mcp"}, "grant_type": {"refresh_token"}, "refresh_token": {member.Refresh}}); status == 200 {
		t.Fatal("disconnected connection can refresh")
	}
	if status, _ := personalMCP(t, r, owner.Access, "get_me", struct{}{}); status != 200 {
		t.Fatal("disconnect revoked another account", status)
	}
}
