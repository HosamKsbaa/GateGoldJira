package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/time/rate"
)

const localTestPassword = "local-password-for-tests"

func localLoginFixture(t *testing.T) (config.Config, LocalAccounts) {
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
	hash, err := bcrypt.GenerateFromPassword([]byte(localTestPassword), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	records := LocalAccounts{Accounts: []LocalAccount{{
		Username:     "owner",
		PasswordHash: string(hash),
		Subject:      "local|owner",
		Email:        "owner@example.test",
	}}}
	settings := config.Config{
		Environment: config.Development, AuthMode: config.DevelopmentAuth, StorageMode: config.LocalStorage,
		DatabaseURL: "postgres://dev:local@127.0.0.1:54329/dev?sslmode=disable", Issuer: "http://127.0.0.1:21080/development-identity/",
		RESTAudience: "http://127.0.0.1:21080/api", MCPAudience: "http://127.0.0.1:21080/mcp", RequiredScope: "gategoldjira:access",
		DevSigningKeyFile: keyPath, AllowedOrigins: []string{"http://localhost:4201"},
	}
	writeLocalLoginRecords(t, settings, records)
	return settings, records
}

func writeLocalLoginRecords(t *testing.T, settings config.Config, records LocalAccounts) {
	t.Helper()
	data, err := json.Marshal(records)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(LocalCredentialsPath(settings.DevSigningKeyFile), data, 0600); err != nil {
		t.Fatal(err)
	}
}

func approvedLocalIdentity(context.Context, command.ProviderIdentity) (command.UserID, error) {
	return command.NewID[command.UserKind](), nil
}

func TestLocalLoginConstructorRejectsNonlocalEnvironments(t *testing.T) {
	base, _ := localLoginFixture(t)
	for _, test := range []struct {
		name   string
		change func(*config.Config)
	}{
		{"production", func(s *config.Config) { s.Environment = config.Production }},
		{"test environment", func(s *config.Config) { s.Environment = config.Test }},
		{"OIDC", func(s *config.Config) { s.AuthMode = config.OIDC }},
		{"cloud storage", func(s *config.Config) { s.StorageMode = config.GCS }},
		{"remote database", func(s *config.Config) { s.DatabaseURL = "postgres://dev:local@database.example/dev" }},
		{"remote issuer", func(s *config.Config) { s.Issuer = "https://company.auth0.com/" }},
		{"remote REST audience", func(s *config.Config) { s.RESTAudience = "https://service.example/api" }},
		{"remote MCP audience", func(s *config.Config) { s.MCPAudience = "https://service.example/mcp" }},
		{"remote origin", func(s *config.Config) { s.AllowedOrigins = []string{"https://web.example"} }},
		{"empty database", func(s *config.Config) { s.DatabaseURL = "" }},
		{"malformed issuer", func(s *config.Config) { s.Issuer = "://127.0.0.1" }},
		{"Cloud Run", func(s *config.Config) {}},
	} {
		t.Run(test.name, func(t *testing.T) {
			settings := base
			if test.name == "Cloud Run" {
				t.Setenv("K_SERVICE", "cloud-run-service")
			}
			test.change(&settings)
			login, err := NewLocalLogin(settings, approvedLocalIdentity)
			if login != nil || err == nil {
				t.Fatal("unsafe development password configuration was accepted")
			}
		})
	}
	if login, err := NewLocalLogin(base, nil); login != nil || err == nil {
		t.Fatal("missing current-company resolver was accepted")
	}
}

func TestLocalLoginRejectsInvalidOrPublicFixtureFiles(t *testing.T) {
	settings, records := localLoginFixture(t)
	path := LocalCredentialsPath(settings.DevSigningKeyFile)
	valid, _ := json.Marshal(records)
	for _, test := range []struct {
		name   string
		change func()
	}{
		{"missing", func() { _ = os.Remove(path) }},
		{"public parent directory", func() { _ = os.Chmod(filepath.Dir(path), 0755) }},
		{"public permissions", func() { _ = os.Chmod(path, 0644) }},
		{"symlink", func() {
			target := filepath.Join(filepath.Dir(path), "other.json")
			if err := os.WriteFile(target, valid, 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(target, path); err != nil {
				t.Fatal(err)
			}
		}},
		{"directory", func() {
			_ = os.Remove(path)
			if err := os.Mkdir(path, 0700); err != nil {
				t.Fatal(err)
			}
		}},
		{"malformed JSON", func() { _ = os.WriteFile(path, []byte(`{"accounts":`), 0600) }},
		{"unknown field", func() { _ = os.WriteFile(path, []byte(`{"accounts":[],"private":"do-not-echo"}`), 0600) }},
		{"second JSON value", func() { _ = os.WriteFile(path, append(append([]byte{}, valid...), []byte(` {}`)...), 0600) }},
		{"empty accounts", func() { writeLocalLoginRecords(t, settings, LocalAccounts{Accounts: []LocalAccount{}}) }},
		{"duplicate usernames", func() {
			writeLocalLoginRecords(t, settings, LocalAccounts{Accounts: []LocalAccount{records.Accounts[0], records.Accounts[0]}})
		}},
		{"bad username", func() {
			account := records.Accounts[0]
			account.Username = "Owner"
			writeLocalLoginRecords(t, settings, LocalAccounts{Accounts: []LocalAccount{account}})
		}},
		{"foreign subject", func() {
			account := records.Accounts[0]
			account.Subject = "local|administrator"
			writeLocalLoginRecords(t, settings, LocalAccounts{Accounts: []LocalAccount{account}})
		}},
		{"invalid email", func() {
			account := records.Accounts[0]
			account.Email = "not-an-email"
			writeLocalLoginRecords(t, settings, LocalAccounts{Accounts: []LocalAccount{account}})
		}},
		{"invalid hash", func() {
			account := records.Accounts[0]
			account.PasswordHash = "plain-password"
			writeLocalLoginRecords(t, settings, LocalAccounts{Accounts: []LocalAccount{account}})
		}},
		{"weak hash", func() {
			account := records.Accounts[0]
			account.PasswordHash = strings.Replace(account.PasswordHash, "$10$", "$04$", 1)
			writeLocalLoginRecords(t, settings, LocalAccounts{Accounts: []LocalAccount{account}})
		}},
		{"expensive hash", func() {
			account := records.Accounts[0]
			account.PasswordHash = strings.Replace(account.PasswordHash, "$10$", "$15$", 1)
			writeLocalLoginRecords(t, settings, LocalAccounts{Accounts: []LocalAccount{account}})
		}},
		{"oversized JSON suffix", func() {
			_ = os.WriteFile(path, append(append(append([]byte{}, valid...), []byte(strings.Repeat(" ", 64*1024))...), 'x'), 0600)
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := os.Chmod(filepath.Dir(path), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.RemoveAll(path); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, valid, 0600); err != nil {
				t.Fatal(err)
			}
			test.change()
			login, err := NewLocalLogin(settings, approvedLocalIdentity)
			if login != nil || err == nil {
				t.Fatal("unsafe local password fixture file was accepted")
			}
			if strings.Contains(err.Error(), records.Accounts[0].PasswordHash) || strings.Contains(err.Error(), "do-not-echo") {
				t.Fatal("credential-file failure exposed private data")
			}
		})
	}
}

func TestLocalLoginChecksPasswordsCurrentApprovalAndRESTTokenClaims(t *testing.T) {
	settings, _ := localLoginFixture(t)
	var calls int
	var denied bool
	login, err := NewLocalLogin(settings, func(_ context.Context, identity command.ProviderIdentity) (command.UserID, error) {
		calls++
		if identity.Issuer != settings.Issuer || identity.Subject != "local|owner" || identity.VerifiedEmail == nil || *identity.VerifiedEmail != "owner@example.test" {
			t.Fatal("login selected identity from request fields")
		}
		if denied {
			return command.UserID{}, &command.Failure{
				Code:        command.AccountInactive,
				Message:     "An active approved company account is required.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ContactAdministrator,
			}
		}
		return command.NewID[command.UserKind](), nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []LocalCredentials{
		{Username: "owner", Password: "wrong-password"},
		{Username: "unknown", Password: localTestPassword},
		{Username: "owner", Password: localTestPassword + " "},
		{Username: "owner", Password: ""},
		{Username: "owner", Password: strings.Repeat("ع", 37)},
	} {
		session, err := login.SignIn(context.Background(), input)
		var failure *command.Failure
		if session != (LocalSession{}) || !errors.As(err, &failure) || failure.Code != command.Unauthenticated || failure.Message != "The username or password is incorrect." || calls != 0 {
			t.Fatal("invalid credentials disclosed account existence or reached identity binding")
		}
	}
	session, err := login.SignIn(context.Background(), LocalCredentials{Username: " OWNER ", Password: localTestPassword})
	if err != nil || calls != 1 {
		t.Fatalf("valid normalized username failed: %v", err)
	}
	verifier, err := New(settings)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := verifier.Verify(context.Background(), "Bearer "+session.AccessToken, command.REST)
	if err != nil || identity.Subject != "local|owner" || identity.VerifiedEmail == nil || *identity.VerifiedEmail != "owner@example.test" {
		t.Fatal("issued session is not a verified local human REST identity")
	}
	if _, err := verifier.Verify(context.Background(), "Bearer "+session.AccessToken, command.MCP); err == nil {
		t.Fatal("password login token crossed the REST/MCP audience boundary")
	}
	claims := tokenClaims{}
	if _, err := jwt.ParseWithClaims(session.AccessToken, &claims, func(*jwt.Token) (any, error) { return &login.key.PublicKey, nil }, jwt.WithValidMethods([]string{"RS256"})); err != nil {
		t.Fatal("issued session signature is invalid")
	}
	if claims.IssuedAt == nil || claims.ExpiresAt == nil || claims.ExpiresAt.Sub(claims.IssuedAt.Time) != time.Hour || !session.ExpiresAt.Equal(claims.ExpiresAt.Time) || len(claims.Audience) != 1 || claims.Audience[0] != settings.RESTAudience || claims.Scope != settings.RequiredScope || !claims.EmailVerified || claims.GrantType != "" {
		t.Fatal("issued session changed the one-hour delegated-human contract")
	}
	denied = true
	blocked, err := login.SignIn(context.Background(), LocalCredentials{Username: "owner", Password: localTestPassword})
	var failure *command.Failure
	if blocked != (LocalSession{}) || !errors.As(err, &failure) || failure.Code != command.AccountInactive || calls != 2 {
		t.Fatal("disabled company account received a session")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if session, err := login.SignIn(ctx, LocalCredentials{
		Username: "owner",
		Password: localTestPassword,
	}); session != (LocalSession{}) || !errors.Is(err, context.Canceled) || calls != 2 {
		t.Fatal("canceled request reached the current-company resolver")
	}
}

func TestLocalLoginBoundsHashWorkAndAttempts(t *testing.T) {
	settings, _ := localLoginFixture(t)
	login, err := NewLocalLogin(settings, approvedLocalIdentity)
	if err != nil {
		t.Fatal(err)
	}
	assertBusy := func(session LocalSession, err error) {
		t.Helper()
		var failure *command.Failure
		if session != (LocalSession{}) || !errors.As(err, &failure) || failure.Code != command.Busy || !failure.Retryable || failure.NextAction != command.SignIn {
			t.Fatal("bounded login rejected without a safe retryable sign-in failure")
		}
	}
	login.capacity <- struct{}{}
	login.capacity <- struct{}{}
	assertBusy(login.SignIn(context.Background(), LocalCredentials{Username: "owner", Password: localTestPassword}))
	<-login.capacity
	<-login.capacity
	login.limiter = rate.NewLimiter(0, 1)
	if _, err := login.SignIn(context.Background(), LocalCredentials{
		Username: "owner",
		Password: "wrong-password",
	}); err == nil {
		t.Fatal("wrong password accepted")
	}
	assertBusy(login.SignIn(context.Background(), LocalCredentials{Username: "owner", Password: localTestPassword}))
}
