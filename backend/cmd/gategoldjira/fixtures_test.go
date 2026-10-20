package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"gategoldjira/backend/internal/app"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/tests/testenv"
)

func TestLocalFixturesAreRepeatableAndTokensHaveSeparateAudiences(t *testing.T) {
	pool := testenv.Database(t)
	root := t.TempDir()
	isolatedURL, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	isolatedURL.Path = "/" + pool.Config().ConnConfig.Database
	for name, value := range map[string]string{
		"APP_ENV":                 "development",
		"K_SERVICE":               "",
		"AUTH_MODE":               "development",
		"STORAGE_MODE":            "local",
		"DATABASE_URL":            isolatedURL.String(),
		"AUTH_ISSUER":             "http://localhost/development/",
		"REST_AUDIENCE":           "http://localhost/api",
		"MCP_AUDIENCE":            "http://localhost/mcp",
		"DEV_SIGNING_KEY_FILE":    filepath.Join(root, "identity", "key.pem"),
		"CURSOR_SECRET_FILE":      filepath.Join(root, "cursor-secret"),
		"LOCAL_PICTURE_DIRECTORY": filepath.Join(root, "pictures"),
		"ALLOWED_ORIGINS":         "http://localhost:4200",
	} {
		t.Setenv(name, value)
	}
	ctx := context.Background()
	var firstPasswords []byte
	for i := 0; i < 2; i++ {
		if err := initializeFixtures(ctx); err != nil {
			t.Fatal(err)
		}
		passwords, err := os.ReadFile(filepath.Join(root, "identity", "accounts.json"))
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			firstPasswords = passwords
		} else if !bytes.Equal(firstPasswords, passwords) {
			t.Fatal("fixture initialization replaced local passwords")
		}
	}
	var count int
	for table, want := range map[string]int{
		"users":           5,
		"user_identities": 4,
		"projects":        1,
		"issues":          5,
		"comments":        1,
		"pictures":        1,
		"notifications":   1,
	} {
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); err != nil || count != want {
			t.Fatalf("fixture table %s: %d %v", table, count, err)
		}
	}
	for _, fixture := range fixtureUsers() {
		var approvedFixture bool
		if err := pool.QueryRow(ctx, `SELECT approved_at IS NOT NULL AND email=$2 AND display_name=$3 AND is_administrator=$4 AND (disabled_at IS NOT NULL)=$5 FROM users WHERE id=$1`, fixture.ID, fixture.Email, fixture.Name, fixture.Administrator, fixture.Disabled).Scan(&approvedFixture); err != nil || !approvedFixture {
			t.Fatal("fixture account approval or identity changed", fixture.ID, err)
		}
	}
	var inactiveSystemActor bool
	if err := pool.QueryRow(ctx, `SELECT approved_at IS NULL AND disabled_at IS NOT NULL AND NOT is_administrator AND display_name='GateGoldJira reminder'
 AND NOT EXISTS(SELECT 1 FROM user_identities WHERE user_id=users.id)
 AND NOT EXISTS(SELECT 1 FROM project_memberships WHERE user_id=users.id)
 FROM users WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff'`).Scan(&inactiveSystemActor); err != nil || !inactiveSystemActor {
		t.Fatal("automated reminder actor must remain unapproved, disabled and unbound", err)
	}
	settings, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	verifier, err := auth.New(settings)
	if err != nil {
		t.Fatal(err)
	}
	token, err := os.ReadFile(filepath.Join(root, "identity", "tokens", "owner-web.token"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifier.Verify(ctx, "Bearer "+string(token), command.REST); err != nil {
		t.Fatal(err)
	}
	if _, err := verifier.Verify(ctx, "Bearer "+string(token), command.MCP); err == nil {
		t.Fatal("development token crossed audiences")
	}
	checkPasswordSignIn(t, ctx, root, settings)
	t.Setenv("K_SERVICE", "cloud-run")
	if err := initializeFixtures(ctx); err == nil {
		t.Fatal("fixture initializer ran in Cloud Run")
	}
}

func checkPasswordSignIn(t *testing.T, ctx context.Context, root string, settings config.Config) {
	t.Helper()
	var passwords fixturePasswords
	data, err := os.ReadFile(filepath.Join(root, "identity", "accounts.json"))
	if err != nil || json.Unmarshal(data, &passwords) != nil || len(passwords.Accounts) != 4 {
		t.Fatal("missing private local accounts")
	}
	hashed, err := os.ReadFile(filepath.Join(root, "identity", "credentials.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, account := range passwords.Accounts {
		if bytes.Contains(hashed, []byte(account.Password)) {
			t.Fatal("plaintext password in runtime credentials")
		}
	}
	for _, name := range []string{"accounts.json", "credentials.json"} {
		info, err := os.Stat(filepath.Join(root, "identity", name))
		if err != nil || info.Mode().Perm() != 0600 {
			t.Fatal("local credential permissions")
		}
	}
	instance, err := app.New(ctx, settings, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	defer instance.Close()
	request := func(method, path string, body []byte, token string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		instance.Handler.ServeHTTP(w, r)
		return w
	}
	login := func(account fixturePassword) *httptest.ResponseRecorder {
		t.Helper()
		body, _ := json.Marshal(auth.LocalCredentials{Username: account.Username, Password: account.Password})
		w := request("POST", "/api/v1/auth/local-sign-in", body, "")
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("login response can be cached")
		}
		if w.Code != 200 && bytes.Contains(w.Body.Bytes(), []byte(account.Password)) {
			t.Fatal("password echoed in error")
		}
		return w
	}
	wrong := login(fixturePassword{Username: "owner", Password: "incorrect-secret"})
	unknown := login(fixturePassword{Username: "unknown", Password: "incorrect-secret"})
	if wrong.Code != 401 || unknown.Code != 401 || !bytes.Equal(wrong.Body.Bytes(), unknown.Body.Bytes()) {
		t.Fatal("login revealed account existence")
	}
	if login(passwords.Accounts[3]).Code != http.StatusForbidden {
		t.Fatal("disabled identity signed in")
	}
	result := login(passwords.Accounts[0])
	var session auth.LocalSession
	if result.Code != 200 || json.Unmarshal(result.Body.Bytes(), &session) != nil || session.AccessToken == "" {
		t.Fatal("password login failed", result.Code)
	}
	meResponse := request("GET", "/api/v1/me", nil, session.AccessToken)
	var me identity.Me
	if meResponse.Code != 200 || json.Unmarshal(meResponse.Body.Bytes(), &me) != nil || !me.Administrator {
		t.Fatal("password did not sign in as Owner")
	}
	if _, err := instance.Database.Pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", me.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if request("GET", "/api/v1/me", nil, session.AccessToken).Code != 403 || login(passwords.Accounts[0]).Code != 403 {
		t.Fatal("password session ignored current account revocation")
	}
	if _, err := instance.Database.Pool.Exec(ctx, "UPDATE users SET disabled_at=NULL WHERE id=$1", me.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if login(passwords.Accounts[0]).Code != 200 {
		t.Fatal("reactivated Owner cannot sign in")
	}
	if request("POST", "/api/v1/auth/local-sign-in", []byte(`{"username":"owner","password":"incorrect-secret","administrator":true}`), "").Code != 422 {
		t.Fatal("caller supplied identity claims accepted")
	}
	oversize := request("POST", "/api/v1/auth/local-sign-in", bytes.Repeat([]byte("x"), 16*1024+1), "")
	if oversize.Code != 413 || oversize.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("unbounded credential request")
	}
	settings.Environment = config.Test
	noLocal, err := app.New(ctx, settings, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	defer noLocal.Close()
	if noLocal.API.OpenAPI().Paths["/api/v1/auth/local-sign-in"] != nil {
		t.Fatal("local endpoint registered outside development")
	}
	r := httptest.NewRequest("POST", "/api/v1/auth/local-sign-in", bytes.NewReader([]byte(`{}`)))
	r.Header.Set("Authorization", "Bearer "+session.AccessToken)
	w := httptest.NewRecorder()
	noLocal.Handler.ServeHTTP(w, r)
	if w.Code != 404 {
		t.Fatal("local endpoint reachable outside development", w.Code)
	}
}
