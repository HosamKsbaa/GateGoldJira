package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"golang.org/x/crypto/bcrypt"
)

func localHTTPLogin(t *testing.T, resolve auth.ResolveIdentity) *auth.LocalLogin {
	t.Helper()
	t.Setenv("K_SERVICE", "")
	directory := t.TempDir()
	if err := os.Chmod(directory, 0700); err != nil {
		t.Fatal(err)
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	keyPath := filepath.Join(directory, "key.pem")
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0600); err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("local-password-for-tests"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(auth.LocalAccounts{Accounts: []auth.LocalAccount{{
		Username:     "owner",
		PasswordHash: string(hash),
		Subject:      "local|owner",
		Email:        "owner@example.test",
	}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(auth.LocalCredentialsPath(keyPath), data, 0600); err != nil {
		t.Fatal(err)
	}
	login, err := auth.NewLocalLogin(config.Config{
		Environment: config.Development, AuthMode: config.DevelopmentAuth, StorageMode: config.LocalStorage,
		DatabaseURL: "postgres://dev:local@127.0.0.1:54329/dev?sslmode=disable", Issuer: "http://127.0.0.1:21080/development-identity/",
		RESTAudience: "http://127.0.0.1:21080/api", MCPAudience: "http://127.0.0.1:21080/mcp", RequiredScope: "gategoldjira:access",
		DevSigningKeyFile: keyPath, AllowedOrigins: []string{"http://localhost:4201"},
	}, resolve)
	if err != nil {
		t.Fatal(err)
	}
	return login
}

func TestLocalLoginHTTPIsPublicTypedBoundedAndRedactsFailures(t *testing.T) {
	var resolveError error
	var resolveCalls int
	login := localHTTPLogin(t, func(context.Context, command.ProviderIdentity) (command.UserID, error) {
		resolveCalls++
		return command.NewID[command.UserKind](), resolveError
	})
	mux := http.NewServeMux()
	api := New(mux)
	RegisterLocalLogin(api, login)
	handler := CORS([]string{"http://localhost:4201"}, LocalLoginHandler(mux))
	for _, test := range []struct {
		name, body, origin string
		resolverError      error
		want               int
	}{
		{
			"correct credentials without bearer",
			`{"username":"owner","password":"local-password-for-tests"}`,
			"http://localhost:4201",
			nil,
			200,
		},
		{"wrong password", `{"username":"owner","password":"do-not-echo"}`, "", nil, 401},
		{"unknown username", `{"username":"unknown-user-do-not-echo","password":"local-password-for-tests"}`, "", nil, 401},
		{"missing password", `{"username":"owner"}`, "", nil, 422},
		{"empty password", `{"username":"owner","password":""}`, "", nil, 422},
		{"unknown authority field", `{"username":"owner","password":"do-not-echo","administrator":true}`, "", nil, 422},
		{"malformed JSON", `{"username":"owner","password":"do-not-echo"`, "", nil, 400},
		{"invalid type", `{"username":42,"password":"do-not-echo"}`, "", nil, 422},
		{"oversized body", `{"username":"owner","password":"` + strings.Repeat("x", 16*1024) + `"}`, "", nil, 413},
		{"foreign origin", `{"username":"owner","password":"do-not-echo"}`, "https://evil.example", nil, 403},
		{
			"disabled company user",
			`{"username":"owner","password":"local-password-for-tests"}`,
			"",
			&command.Failure{
				Code:        command.AccountInactive,
				Message:     "An active approved company account is required.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ContactAdministrator,
			},
			403,
		},
		{
			"resolver failure",
			`{"username":"owner","password":"local-password-for-tests"}`,
			"",
			errors.New("database password do-not-echo"),
			503,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			resolveError = test.resolverError
			before := resolveCalls
			r := httptest.NewRequest(http.MethodPost, LocalLoginPath, strings.NewReader(test.body))
			r.Header.Set("Content-Type", "application/json")
			if test.origin != "" {
				r.Header.Set("Origin", test.origin)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != test.want {
				t.Fatalf("unexpected status: %d", w.Code)
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("sign-in response allowed caching")
			}
			if test.want == 200 {
				var session auth.LocalSession
				if json.Unmarshal(w.Body.Bytes(), &session) != nil || session.AccessToken == "" || session.ExpiresAt.IsZero() || resolveCalls != before+1 {
					t.Fatal("public typed sign-in did not create a verified company session")
				}
			} else {
				var failure FailureBody
				if json.Unmarshal(w.Body.Bytes(), &failure) != nil || failure.Error.Code == "" {
					t.Fatal("sign-in failure was not typed")
				}
				for _, secret := range []string{
					"do-not-echo",
					"local-password-for-tests",
					"unknown-user-do-not-echo",
					"passwordHash",
					"accessToken",
				} {
					if strings.Contains(w.Body.String(), secret) {
						t.Fatal("sign-in failure exposed private input or credentials")
					}
				}
				if test.resolverError == nil && resolveCalls != before {
					t.Fatal("rejected input reached company identity binding")
				}
			}
		})
	}
}

func TestLocalLoginUnknownLengthBodyStillHasSmallBudget(t *testing.T) {
	mux := http.NewServeMux()
	RegisterLocalLogin(New(mux), nil)
	r := httptest.NewRequest(http.MethodPost, LocalLoginPath, strings.NewReader(`{"username":"owner","password":"`+strings.Repeat("x", 16*1024)+`"}`))
	r.ContentLength = -1
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	LocalLoginHandler(mux).ServeHTTP(w, r)
	if w.Code != 413 || w.Header().Get("Cache-Control") != "no-store" || strings.Contains(w.Body.String(), strings.Repeat("x", 100)) {
		t.Fatal("unknown-length login request escaped its redacted 16 KiB budget")
	}
}

func TestLocalLoginContractSeparatesPublicPasswordsFromSessionOutput(t *testing.T) {
	mux := http.NewServeMux()
	api := New(mux)
	RegisterLocalLogin(api, nil)
	op := api.OpenAPI().Paths[LocalLoginPath].Post
	if op == nil || op.OperationID != "localSignIn" || op.Security == nil || len(op.Security) != 0 {
		t.Fatal("local sign-in inherited the global bearer requirement")
	}
	encoded, err := json.Marshal(op)
	if err != nil {
		t.Fatal(err)
	}
	var raw struct {
		Security json.RawMessage `json:"security"`
	}
	if json.Unmarshal(encoded, &raw) != nil || string(raw.Security) != "[]" {
		t.Fatal("public security override was lost in generated OpenAPI")
	}
	input := api.OpenAPI().Components.Schemas.Map()["LocalCredentials"]
	output := api.OpenAPI().Components.Schemas.Map()["LocalSession"]
	if input == nil || output == nil || len(input.Properties) != 2 || input.Properties["username"] == nil || input.Properties["password"] == nil || input.Properties["username"].Type != "string" || input.Properties["password"].Type != "string" || !input.Properties["password"].WriteOnly {
		t.Fatal("credentials are not concrete typed password input")
	}
	if input.AdditionalProperties != false {
		t.Fatal("sign-in schema allowed caller authority fields")
	}
	for _, field := range []string{"username", "password"} {
		found := false
		for _, required := range input.Required {
			found = found || required == field
		}
		if !found {
			t.Fatal("sign-in made a credential optional")
		}
	}
	if len(output.Properties) != 2 || output.Properties["accessToken"] == nil || output.Properties["expiresAt"] == nil {
		t.Fatal("session output included password fixtures or unexpected claims")
	}
	for _, status := range []string{"400", "401", "403", "413", "422", "503"} {
		if op.Responses[status] == nil || op.Responses[status].Content["application/json"] == nil {
			t.Fatal("sign-in has an undocumented untyped failure status")
		}
	}
	// Registration-only generation can produce schemas without private keys,
	// fixture passwords, a database, or a callable local authentication service.
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, LocalLoginPath, strings.NewReader(`{"username":"owner","password":"do-not-echo"}`))
	r.Header.Set("Content-Type", "application/json")
	LocalLoginHandler(mux).ServeHTTP(w, r)
	if w.Code != 404 || w.Header().Get("Cache-Control") != "no-store" || strings.Contains(w.Body.String(), "do-not-echo") {
		t.Fatal("contract-only registration became a usable authentication service")
	}
}
