package mcpclient

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/app"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/tests/testenv"
	"github.com/golang-jwt/jwt/v5"
	"github.com/modelcontextprotocol/go-sdk/auth"
)

const publicClient = "registered-public-reference"
const redirectURI = "http://127.0.0.1:39177/oauth/callback"

type authorization struct{ challenge, resource, redirect string }
type fixture struct {
	issuer, api                                              *httptest.Server
	endpoint                                                 string
	settings                                                 config.Config
	admin                                                    command.UserID
	key                                                      *rsa.PrivateKey
	application                                              atomic.Pointer[app.Application]
	codes                                                    sync.Map
	authorizations, exchanges, metadataReads, discoveryReads atomic.Int32
	httpClient                                               *http.Client
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	f := &fixture{admin: command.NewID[command.UserKind](), httpClient: &http.Client{Timeout: 10 * time.Second}}
	if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,'admin@test.dev','admin@test.dev','مطور مدير',now(),true)", f.admin.UUID); err != nil {
		t.Fatal(err)
	}
	var err error
	f.key, err = rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	data, err := x509.MarshalPKCS8PrivateKey(f.key)
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	keyFile := filepath.Join(directory, "fixture.pem")
	if err := os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: data}), 0600); err != nil {
		t.Fatal(err)
	}
	f.issuer = httptest.NewServer(http.HandlerFunc(f.authorizationServer))
	t.Cleanup(f.issuer.Close)
	f.api = httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/oauth-protected-resource/mcp" {
			f.metadataReads.Add(1)
		}
		f.application.Load().Handler.ServeHTTP(w, r)
	}))
	origin := "http://" + f.api.Listener.Addr().String()
	f.endpoint = origin + "/mcp"
	databaseURL, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	databaseURL.Path = "/" + pool.Config().ConnConfig.Database
	location, err := time.LoadLocation("Africa/Cairo")
	if err != nil {
		t.Fatal(err)
	}
	f.settings = config.Config{
		Environment:           config.Test,
		DatabaseURL:           databaseURL.String(),
		CompanyLocation:       location,
		AuthMode:              config.DevelopmentAuth,
		Issuer:                f.issuer.URL + "/",
		RESTAudience:          origin + "/api",
		MCPAudience:           f.endpoint,
		RequiredScope:         "gategoldjira:access",
		DevSigningKeyFile:     keyFile,
		StorageMode:           config.LocalStorage,
		LocalPictureDirectory: filepath.Join(directory, "pictures"),
		CursorSecret:          []byte(strings.Repeat("m", 32)),
		AllowedOrigins:        []string{origin},
	}
	f.restart(t)
	f.api.Start()
	t.Cleanup(func() { f.api.Close(); f.application.Load().Close() })
	return f
}
func (f *fixture) restart(t *testing.T) {
	t.Helper()
	instance, err := app.New(context.Background(), f.settings, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	old := f.application.Swap(instance)
	if old != nil {
		old.Close()
	}
}
func (f *fixture) accessToken(t *testing.T, channel string) string {
	t.Helper()
	token, err := f.sign(channel)
	if err != nil {
		t.Fatal(err)
	}
	return token
}
func (f *fixture) sign(channel string) (string, error) {
	aud := f.endpoint
	if channel == "web" {
		aud = f.settings.RESTAudience
	}
	return jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":                            f.issuer.URL + "/",
		"sub":                            "google-oauth2|fixture-admin",
		"aud":                            aud,
		"exp":                            time.Now().Add(time.Hour).Unix(),
		"scope":                          "gategoldjira:access",
		"https://gategoldjira.app/email": "admin@test.dev",
		"https://gategoldjira.app/email_verified": true,
	}).SignedString(f.key)
}

// This authorization server is a test fixture only. It proves protocol messages
// and signed access-token validation without claiming managed Auth0 behavior.
func (f *fixture) authorizationServer(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch strings.TrimSuffix(r.URL.Path, "/") {
	case "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration":
		f.discoveryReads.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                                         f.issuer.URL + "/",
			"authorization_endpoint":                         f.issuer.URL + "/authorize",
			"token_endpoint":                                 f.issuer.URL + "/token",
			"response_types_supported":                       []string{"code"},
			"grant_types_supported":                          []string{"authorization_code"},
			"token_endpoint_auth_methods_supported":          []string{"none"},
			"code_challenge_methods_supported":               []string{"S256"},
			"scopes_supported":                               []string{"gategoldjira:access"},
			"authorization_response_iss_parameter_supported": true,
		})
	case "/authorize":
		q := r.URL.Query()
		if q.Get("client_id") != publicClient || q.Get("redirect_uri") != redirectURI || q.Get("response_type") != "code" || q.Get("scope") != "gategoldjira:access" || q.Get("code_challenge_method") != "S256" || len(q.Get("code_challenge")) != 43 || q.Get("resource") != f.endpoint || q.Get("state") == "" {
			http.Error(w, "invalid registered public authorization request", 400)
			return
		}
		code := command.NewID[command.EventKind]().String()
		f.codes.Store(code, authorization{q.Get("code_challenge"), q.Get("resource"), q.Get("redirect_uri")})
		f.authorizations.Add(1)
		callback, _ := url.Parse(redirectURI)
		values := url.Values{"code": {code}, "state": {q.Get("state")}, "iss": {f.issuer.URL + "/"}}
		callback.RawQuery = values.Encode()
		http.Redirect(w, r, callback.String(), http.StatusFound)
	case "/token":
		if r.Method != "POST" || r.ParseForm() != nil {
			http.Error(w, "invalid token request", 400)
			return
		}
		if r.Header.Get("Authorization") != "" {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_client"})
			return
		}
		v, ok := f.codes.Load(r.Form.Get("code"))
		if !ok {
			http.Error(w, "invalid one-use authorization code", 400)
			return
		}
		a := v.(authorization)
		sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
		if r.Form.Get("grant_type") != "authorization_code" || r.Form.Get("client_id") != publicClient || r.Form.Get("client_secret") != "" || r.Header.Get("Authorization") != "" || r.Form.Get("redirect_uri") != a.redirect || r.Form.Get("resource") != a.resource || base64.RawURLEncoding.EncodeToString(sum[:]) != a.challenge {
			http.Error(w, "invalid public PKCE exchange", 400)
			return
		}
		f.codes.Delete(r.Form.Get("code"))
		token, err := f.sign("mcp")
		if err != nil {
			http.Error(w, "signing failed", 500)
			return
		}
		f.exchanges.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": token,
			"token_type":   "Bearer",
			"expires_in":   3600,
			"scope":        "gategoldjira:access",
		})
	default:
		http.NotFound(w, r)
	}
}
func (f *fixture) fetchCode(t *testing.T) auth.AuthorizationCodeFetcher {
	return func(ctx context.Context, args *auth.AuthorizationArgs) (*auth.AuthorizationResult, error) {
		t.Helper()
		client := &http.Client{
			Timeout:       10 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		}
		request, err := http.NewRequestWithContext(ctx, "GET", args.URL, nil)
		if err != nil {
			return nil, err
		}
		response, err := client.Do(request)
		if err != nil {
			return nil, err
		}
		defer response.Body.Close()
		if response.StatusCode != 302 {
			return nil, fmt.Errorf("authorization fixture rejected request: status %d", response.StatusCode)
		}
		callback, err := url.Parse(response.Header.Get("Location"))
		if err != nil {
			return nil, err
		}
		expected, _ := url.Parse(redirectURI)
		if callback.Scheme != expected.Scheme || callback.Host != expected.Host || callback.Path != expected.Path {
			return nil, fmt.Errorf("non-exact redirect")
		}
		q := callback.Query()
		return &auth.AuthorizationResult{Code: q.Get("code"), State: q.Get("state"), Iss: q.Get("iss")}, nil
	}
}
func (f *fixture) raw(t *testing.T, token, version, body string) *http.Response {
	t.Helper()
	request, err := http.NewRequest("POST", f.endpoint, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json, text/event-stream")
	request.Header.Set("MCP-Protocol-Version", version)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := f.httpClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}
