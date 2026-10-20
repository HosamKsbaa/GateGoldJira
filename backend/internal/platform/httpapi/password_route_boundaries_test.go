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
	"time"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
)

func passwordRouteFixture(t *testing.T, resolve auth.ResolveIdentity) (*auth.LocalLogin, config.Config) {
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
	encoded, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	keyPath := filepath.Join(directory, "key.pem")
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encoded}), 0600); err != nil {
		t.Fatal(err)
	}
	account, err := auth.PasswordAccount("owner", "owner@example.test", "hosted-route-test-password")
	if err != nil {
		t.Fatal(err)
	}
	records, err := json.Marshal(auth.LocalAccounts{Accounts: []auth.LocalAccount{account}})
	if err != nil {
		t.Fatal(err)
	}
	credentials := filepath.Join(directory, "accounts.json")
	if err := os.WriteFile(credentials, records, 0600); err != nil {
		t.Fatal(err)
	}
	settings := config.Config{
		Environment: config.Production, DeploymentTarget: config.VM, AuthMode: config.PasswordAuth,
		Issuer: "https://jira.example.test/", RESTAudience: "https://jira.example.test/api",
		MCPAudience: "https://jira.example.test/mcp", AllowedOrigins: []string{"https://jira.example.test"},
		PasswordSigningKeyFile: keyPath, PasswordCredentialsFile: credentials, RequiredScope: "gategoldjira:access",
	}
	login, err := auth.NewPasswordLogin(settings, resolve)
	if err != nil {
		t.Fatal(err)
	}
	return login, settings
}

func passwordRouteRequest(handler http.Handler, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, PasswordLoginPath, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	reply := httptest.NewRecorder()
	handler.ServeHTTP(reply, request)
	return reply
}

func TestPasswordRouteBoundaryContractIsPublicAndNilServiceCannotAuthenticate(t *testing.T) {
	mux := http.NewServeMux()
	api := New(mux)
	RegisterPasswordLogin(api, nil)
	op := api.OpenAPI().Paths[PasswordLoginPath].Post
	if op == nil || op.OperationID != "passwordSignIn" || op.Security == nil || len(op.Security) != 0 ||
		op.MaxBodyBytes != 16*1024 {
		t.Fatal("operator password route lost its public, bounded contract")
	}
	for _, status := range []string{"400", "401", "403", "413", "422", "503"} {
		response := op.Responses[status]
		if response == nil || response.Content["application/json"] == nil {
			t.Fatal("operator password route omitted a concrete failure contract")
		}
	}
	reply := passwordRouteRequest(LocalLoginHandler(mux), `{"username":"owner","password":"private-input-marker"}`)
	var body FailureBody
	if reply.Code != http.StatusNotFound || json.Unmarshal(reply.Body.Bytes(), &body) != nil ||
		body.Error.Code != command.Unavailable || reply.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("registration-only password endpoint became usable or untyped")
	}
	if strings.Contains(reply.Body.String(), "private-input-marker") {
		t.Fatal("missing service echoed private credentials")
	}
}

func TestPasswordRouteBoundaryRealJWTAndCurrentCompanyApproval(t *testing.T) {
	userID := command.NewID[command.UserKind]()
	calls := 0
	var approvalFailure error
	resolve := func(_ context.Context, identity command.ProviderIdentity) (command.UserID, error) {
		calls++
		if identity.Issuer != "https://jira.example.test/" || identity.Subject != "password|owner" ||
			identity.VerifiedEmail == nil || *identity.VerifiedEmail != "owner@example.test" {
			t.Fatal("password route selected an untrusted provider identity")
		}
		return userID, approvalFailure
	}
	login, settings := passwordRouteFixture(t, resolve)
	mux := http.NewServeMux()
	RegisterPasswordLogin(New(mux), login)
	handler := LocalLoginHandler(mux)
	reply := passwordRouteRequest(handler, `{"username":"owner","password":"hosted-route-test-password"}`)
	var session auth.LocalSession
	if reply.Code != 200 || reply.Header().Get("Cache-Control") != "no-store" ||
		json.Unmarshal(reply.Body.Bytes(), &session) != nil || session.AccessToken == "" || calls != 1 {
		t.Fatal("hosted password endpoint failed to issue a current approved local JWT")
	}
	verifier, err := auth.New(settings)
	if err != nil {
		t.Fatal(err)
	}
	sessions := auth.Sessions{Verifier: verifier, Resolve: resolve, Location: time.UTC}
	nextCalls := 0
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalls++
		actor, err := auth.Actor(r.Context())
		if err != nil || actor.UserID != userID || actor.Channel != command.REST {
			t.Fatal("verified company actor was not installed")
		}
		w.WriteHeader(http.StatusNoContent)
	})
	request := func(channel command.Channel, challenge string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/protected", nil)
		r.Header.Set("Authorization", "Bearer "+session.AccessToken)
		w := httptest.NewRecorder()
		Authenticated(sessions, channel, challenge, next).ServeHTTP(w, r)
		return w
	}
	if w := request(command.REST, ""); w.Code != 204 || calls != 2 || nextCalls != 1 {
		t.Fatal("actual password JWT was rejected by REST")
	}
	before := calls
	challenge := `Bearer resource_metadata="https://jira.example.test/.well-known/oauth-protected-resource"`
	wrongAudience := request(command.MCP, challenge)
	var failure FailureBody
	if wrongAudience.Code != 401 || json.Unmarshal(wrongAudience.Body.Bytes(), &failure) != nil ||
		failure.Error.Code != command.Unauthenticated || wrongAudience.Header().Get("WWW-Authenticate") != challenge ||
		calls != before || nextCalls != 1 {
		t.Fatal("REST-only password JWT crossed MCP or reached company lookup")
	}
	approvalFailure = &command.Failure{Code: command.AccountInactive, Message: "Company access is inactive.",
		FieldErrors: []command.FieldError{}, NextAction: command.ContactAdministrator}
	inactive := request(command.REST, challenge)
	if inactive.Code != 403 || json.Unmarshal(inactive.Body.Bytes(), &failure) != nil ||
		failure.Error.Code != command.AccountInactive || inactive.Header().Get("WWW-Authenticate") != "" || nextCalls != 1 {
		t.Fatal("a previously issued JWT bypassed current company approval")
	}
	for _, value := range []string{session.AccessToken, "hosted-route-test-password", "passwordHash"} {
		if strings.Contains(inactive.Body.String(), value) || strings.Contains(wrongAudience.Body.String(), value) {
			t.Fatal("authentication failure exposed secret material")
		}
	}
	approvalFailure = nil
	if restored := request(command.REST, ""); restored.Code != 204 || nextCalls != 2 {
		t.Fatal("current approval restoration did not apply to the same valid identity")
	}
}

func TestPasswordRouteBoundaryApprovalFailureIsTypedAndRedacted(t *testing.T) {
	var resolutionError error
	resolveCalls := 0
	login, _ := passwordRouteFixture(t, func(context.Context, command.ProviderIdentity) (command.UserID, error) {
		resolveCalls++
		return command.NewID[command.UserKind](), resolutionError
	})
	mux := http.NewServeMux()
	RegisterPasswordLogin(New(mux), login)
	for _, test := range []struct {
		name, password string
		resolveError   error
		status         int
		code           command.FailureCode
	}{
		{"incorrect-password", "private-wrong-password", nil, 401, command.Unauthenticated},
		{"inactive-company-account", "hosted-route-test-password", &command.Failure{
			Code: command.AccountInactive, Message: "Account inactive.", FieldErrors: []command.FieldError{},
			NextAction: command.ContactAdministrator,
		}, 403, command.AccountInactive},
		{"resolution-unavailable", "hosted-route-test-password", errors.New("private-resolver-error-marker"), 503, command.Busy},
	} {
		t.Run(test.name, func(t *testing.T) {
			resolutionError = test.resolveError
			before := resolveCalls
			payload, _ := json.Marshal(auth.LocalCredentials{Username: "owner", Password: test.password})
			reply := passwordRouteRequest(LocalLoginHandler(mux), string(payload))
			var body FailureBody
			if reply.Code != test.status || json.Unmarshal(reply.Body.Bytes(), &body) != nil ||
				body.Error.Code != test.code || reply.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("password route emitted an incorrect typed failure")
			}
			if test.resolveError == nil && resolveCalls != before {
				t.Fatal("wrong password reached current identity authorization")
			}
			for _, secret := range []string{test.password, "private-resolver-error-marker", "passwordHash", "accessToken"} {
				if strings.Contains(reply.Body.String(), secret) {
					t.Fatal("password failure exposed sensitive material")
				}
			}
		})
	}
}
