package testapp

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/app"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Runtime is an isolated, signed-human fixture. It never connects to a tenant,
// shares a development database or returns its private key in a tool result.
type Runtime struct {
	URL, Issuer           string
	Pool                  *pgxpool.Pool
	Admin, Member, Viewer command.UserID
	settings              config.Config
	key                   *rsa.PrivateKey
	application           atomic.Pointer[app.Application]
}

// PictureStore opens only this isolated runtime's fixture storage. Scale and
// recovery preparation can seed immutable objects without exposing coordinates
// in any application response or connecting to a production bucket.
func (r *Runtime) PictureStore(t *testing.T) *objectstore.Local {
	t.Helper()
	store, err := objectstore.NewLocal(r.settings.LocalPictureDirectory)
	if err != nil {
		t.Fatal(err)
	}
	return store
}

func NewRuntime(t *testing.T) *Runtime {
	t.Helper()
	ctx := context.Background()
	r := &Runtime{
		Pool:   testenv.Database(t),
		Admin:  command.NewID[command.UserKind](),
		Member: command.NewID[command.UserKind](),
		Viewer: command.NewID[command.UserKind](),
		Issuer: "http://127.0.0.1/development-identity/",
	}
	if err := migrations.Apply(ctx, r.Pool); err != nil {
		t.Fatal(err)
	}
	for i, id := range []command.UserID{r.Admin, r.Member, r.Viewer} {
		if _, err := r.Pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", id.UUID, []string{
			"admin@fixture.dev",
			"member@fixture.dev",
			"viewer@fixture.dev",
		}[i], []string{"Admin", "مطور", "Viewer"}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	var err error
	r.key, err = rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(r.key)
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	keyFile := filepath.Join(directory, "fixture.pem")
	if err := os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0600); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, q *http.Request) { r.application.Load().Handler.ServeHTTP(w, q) }))
	r.URL = "http://" + server.Listener.Addr().String()
	dsn, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	dsn.Path = "/" + r.Pool.Config().ConnConfig.Database
	location, err := time.LoadLocation("Africa/Cairo")
	if err != nil {
		t.Fatal(err)
	}
	r.settings = config.Config{
		Environment:           config.Test,
		DatabaseURL:           dsn.String(),
		CompanyLocation:       location,
		AuthMode:              config.DevelopmentAuth,
		Issuer:                r.Issuer,
		RESTAudience:          r.URL + "/api",
		MCPAudience:           r.URL + "/mcp",
		RequiredScope:         "gategoldjira:access",
		DevSigningKeyFile:     keyFile,
		StorageMode:           config.LocalStorage,
		LocalPictureDirectory: filepath.Join(directory, "pictures"),
		CursorSecret:          []byte(strings.Repeat("p", 32)),
		AllowedOrigins:        []string{r.URL},
	}
	r.Restart(t)
	server.Start()
	t.Cleanup(func() { server.Close(); r.application.Load().Close() })
	return r
}
func (r *Runtime) Restart(t *testing.T) {
	t.Helper()
	instance, err := app.New(context.Background(), r.settings, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	old := r.application.Swap(instance)
	if old != nil {
		old.Close()
	}
}
func (r *Runtime) Token(t *testing.T, user command.UserID, channel command.Channel) string {
	t.Helper()
	email := ""
	if err := r.Pool.QueryRow(context.Background(), "SELECT email FROM users WHERE id=$1", user.UUID).Scan(&email); err != nil {
		t.Fatal(err)
	}
	aud := r.settings.RESTAudience
	if channel == command.MCP {
		aud = r.settings.MCPAudience
	}
	value, err := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":                            r.Issuer,
		"sub":                            "google-oauth2|" + user.String(),
		"aud":                            aud,
		"exp":                            time.Now().Add(time.Hour).Unix(),
		"scope":                          "gategoldjira:access",
		"https://gategoldjira.app/email": email,
		"https://gategoldjira.app/email_verified": true,
	}).SignedString(r.key)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

// ApplicationPoolStats reports actual request-pool metrics for isolated tests.
func (r *Runtime) ApplicationPoolStats() *pgxpool.Stat {
	return r.application.Load().Database.Pool.Stat()
}

// EnableLocalBrowserOAuth uses the same explicit local configuration gate as the
// browser fixture runner. It does not weaken production or ordinary test auth.
func (r *Runtime) EnableLocalBrowserOAuth(t *testing.T) {
	t.Helper()
	var email string
	if err := r.Pool.QueryRow(context.Background(), "SELECT email FROM users WHERE id=$1", r.Admin.UUID).Scan(&email); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Dir(r.settings.DevSigningKeyFile), 0700); err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("private-local-browser-test"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(auth.LocalAccounts{Accounts: []auth.LocalAccount{{Username: "owner", PasswordHash: string(hash), Subject: "local|owner", Email: email}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(auth.LocalCredentialsPath(r.settings.DevSigningKeyFile), encoded, 0600); err != nil {
		t.Fatal(err)
	}
	r.settings.Environment = config.Development
	r.Restart(t)
}
