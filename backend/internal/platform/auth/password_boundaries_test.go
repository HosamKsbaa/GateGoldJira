package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

func passwordBoundarySettings(t *testing.T) config.Config {
	t.Helper()
	t.Setenv("K_SERVICE", "")
	directory := t.TempDir()
	return config.Config{
		Environment: config.Production, DeploymentTarget: config.VM, AuthMode: config.PasswordAuth,
		Issuer: "https://jira.example.test/", RESTAudience: "https://jira.example.test/api",
		MCPAudience: "https://jira.example.test/mcp", AllowedOrigins: []string{"https://jira.example.test"},
		PasswordSigningKeyFile:  filepath.Join(directory, "hosted-key.pem"),
		PasswordCredentialsFile: filepath.Join(directory, "hosted-accounts.json"),
		DevSigningKeyFile:       filepath.Join(directory, "development-key.pem"),
		RequiredScope:           "gategoldjira:access",
	}
}

func TestHostedPasswordBoundaryCanonicalOriginAndIndependentPaths(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*config.Config)
	}{
		{"test-environment", func(c *config.Config) { c.Environment = config.Test }},
		{"wrong-auth-mode", func(c *config.Config) { c.AuthMode = config.OIDC }},
		{"wrong-target", func(c *config.Config) { c.DeploymentTarget = config.CloudRun }},
		{"malformed-issuer", func(c *config.Config) { c.Issuer = "https://[invalid/" }},
		{"missing-host", func(c *config.Config) { c.Issuer = "https:///" }},
		{"missing-slash", func(c *config.Config) { c.Issuer = "https://jira.example.test" }},
		{"issuer-subpath", func(c *config.Config) { c.Issuer = "https://jira.example.test/auth/" }},
		{"issuer-userinfo", func(c *config.Config) { c.Issuer = "https://private-user@jira.example.test/" }},
		{"issuer-query", func(c *config.Config) { c.Issuer = "https://jira.example.test/?private-query=1" }},
		{"issuer-fragment", func(c *config.Config) { c.Issuer = "https://jira.example.test/#private-fragment" }},
		{"foreign-rest", func(c *config.Config) { c.RESTAudience = "https://other.example.test/api" }},
		{"foreign-mcp", func(c *config.Config) { c.MCPAudience = "https://other.example.test/mcp" }},
		{"no-origin", func(c *config.Config) { c.AllowedOrigins = nil }},
		{"multiple-origins", func(c *config.Config) {
			c.AllowedOrigins = []string{"https://jira.example.test", "https://other.example.test"}
		}},
		{"relative-key", func(c *config.Config) { c.PasswordSigningKeyFile = "hosted-key.pem" }},
		{"relative-accounts", func(c *config.Config) { c.PasswordCredentialsFile = "accounts.json" }},
		{"development-key-reuse", func(c *config.Config) { c.PasswordSigningKeyFile = c.DevSigningKeyFile }},
		{"development-accounts-reuse", func(c *config.Config) { c.PasswordCredentialsFile = LocalCredentialsPath(c.DevSigningKeyFile) }},
		{"cloud-runtime", func(c *config.Config) { t.Setenv("K_SERVICE", "managed-service") }},
	} {
		t.Run(test.name, func(t *testing.T) {
			settings := passwordBoundarySettings(t)
			if err := ValidatePasswordLoginSettings(settings); err != nil {
				t.Fatal("canonical control rejected", err)
			}
			test.change(&settings)
			if err := ValidatePasswordLoginSettings(settings); err == nil {
				t.Fatal("unsafe hosted login boundary was accepted")
			}
			if login, err := NewPasswordLogin(settings, approvedLocalIdentity); login != nil || err == nil {
				t.Fatal("unsafe hosted login reached usable password authentication")
			}
		})
	}
}

func TestHostedPasswordBoundaryAccountValidationAndByteLimits(t *testing.T) {
	for _, test := range []struct{ name, username, email, password string }{
		{"empty-user", "", "owner@example.test", "long-password-for-tests"},
		{"numeric-user", "1owner", "owner@example.test", "long-password-for-tests"},
		{"unicode-user", "مستخدم", "owner@example.test", "long-password-for-tests"},
		{"long-user", strings.Repeat("a", 65), "owner@example.test", "long-password-for-tests"},
		{"invalid-email", "owner", "missing-address", "long-password-for-tests"},
		{"display-email", "owner", "Owner <owner@example.test>", "long-password-for-tests"},
		{"long-email", "owner", strings.Repeat("a", 310) + "@example.test", "long-password-for-tests"},
		{"fifteen-bytes", "owner", "owner@example.test", strings.Repeat("a", 15)},
		{"seventy-three-bytes", "owner", "owner@example.test", strings.Repeat("a", 73)},
		{"unicode-byte-overflow", "owner", "owner@example.test", strings.Repeat("ش", 36) + "a"},
		{"newline", "owner", "owner@example.test", "password-for-tests\n"},
		{"carriage-return", "owner", "owner@example.test", "password-for-tests\r"},
		{"nul", "owner", "owner@example.test", "password-for-tests\x00"},
	} {
		t.Run(test.name, func(t *testing.T) {
			account, err := PasswordAccount(test.username, test.email, test.password)
			if err == nil || account != (LocalAccount{}) {
				t.Fatal("invalid account produced credential material")
			}
			if strings.Contains(err.Error(), test.password) && test.password != "" {
				t.Fatal("validation echoed the supplied password")
			}
		})
	}
	for _, password := range []string{" " + strings.Repeat("a", 14) + " ", strings.Repeat("ش", 36)} {
		t.Run(fmt.Sprintf("accepted-%d-bytes", len(password)), func(t *testing.T) {
			account, err := PasswordAccount("  OwNeR  ", " OWNER@EXAMPLE.TEST ", password)
			if err != nil {
				t.Fatal("valid byte-boundary password rejected", err)
			}
			if account.Username != "owner" || account.Email != "owner@example.test" || account.Subject != "password|owner" {
				t.Fatal("operator identity was not canonical")
			}
			cost, err := bcrypt.Cost([]byte(account.PasswordHash))
			if err != nil || cost != 12 || bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(password)) != nil {
				t.Fatal("the exact password was not hashed at the production cost")
			}
			if trimmed := strings.TrimSpace(password); trimmed != password &&
				bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(trimmed)) == nil {
				t.Fatal("password whitespace was normalized")
			}
		})
	}
}

func passwordBoundaryPEM(t *testing.T, key any) []byte {
	t.Helper()
	data, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: data})
}

func TestHostedPasswordBoundaryVerifierRejectsUnsafeOrInvalidSigningFiles(t *testing.T) {
	weak, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatal(err)
	}
	ecdsaKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name string
		data []byte
		mode os.FileMode
		kind string
	}{
		{"missing", nil, 0600, "missing"},
		{"directory", nil, 0700, "directory"},
		{"symlink", []byte("not-a-key"), 0600, "symlink"},
		{"public", []byte("not-a-key"), 0644, ""},
		{"group-readable-outside-systemd", []byte("not-a-key"), 0440, ""},
		{"oversized", []byte(strings.Repeat("x", 16385)), 0600, ""},
		{"not-pem", []byte("private-file-marker"), 0600, ""},
		{"invalid-der", pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: []byte("private-file-marker")}), 0600, ""},
		{"pkcs1", pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(weak)}), 0600, ""},
		{"non-rsa", passwordBoundaryPEM(t, ecdsaKey), 0600, ""},
		{"weak-rsa", passwordBoundaryPEM(t, weak), 0600, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			settings := passwordBoundarySettings(t)
			path := settings.PasswordSigningKeyFile
			switch test.kind {
			case "directory":
				err = os.Mkdir(path, 0700)
			case "symlink":
				target := path + ".target"
				if err = os.WriteFile(target, test.data, 0600); err == nil {
					err = os.Symlink(target, path)
				}
			case "missing":
				err = nil
			default:
				err = os.WriteFile(path, test.data, test.mode)
				if err == nil {
					err = os.Chmod(path, test.mode)
				}
			}
			if err != nil {
				t.Fatal(err)
			}
			t.Setenv("CREDENTIALS_DIRECTORY", filepath.Dir(path))
			verifier, err := New(settings)
			if verifier != nil || err == nil {
				t.Fatal("unsafe signing file produced a verifier")
			}
			if strings.Contains(err.Error(), "private-file-marker") {
				t.Fatal("key failure exposed file contents")
			}
		})
	}
}

func TestHostedPasswordBoundaryReloadedVerifierInvalidatesRotatedSigningKey(t *testing.T) {
	settings := passwordBoundarySettings(t)
	makeKey := func() *rsa.PrivateKey {
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(settings.PasswordSigningKeyFile, passwordBoundaryPEM(t, key), 0600); err != nil {
			t.Fatal(err)
		}
		return key
	}
	sign := func(key *rsa.PrivateKey) string {
		email := "owner@example.test"
		claims := tokenClaims{RegisteredClaims: jwt.RegisteredClaims{
			Issuer: settings.Issuer, Subject: "password|owner", Audience: jwt.ClaimStrings{settings.RESTAudience},
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
		}, Claims: Claims{Scope: "gategoldjira:access", Email: &email, EmailVerified: true}}
		token, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return "Bearer " + token
	}
	oldKey := makeKey()
	oldVerifier, err := New(settings)
	if err != nil {
		t.Fatal(err)
	}
	oldToken := sign(oldKey)
	if _, err := oldVerifier.Verify(context.Background(), oldToken, command.REST); err != nil {
		t.Fatal("original signing key was unusable")
	}
	newKey := makeKey()
	reloaded, err := New(settings)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := reloaded.Verify(context.Background(), oldToken, command.REST); err == nil {
		t.Fatal("reloaded verifier accepted the rotated-away signing key")
	}
	identity, err := reloaded.Verify(context.Background(), sign(newKey), command.REST)
	if err != nil || identity.Subject != "password|owner" {
		t.Fatal("new key changed account identity or prevented authentication")
	}
	if _, err := reloaded.Verify(context.Background(), sign(newKey), command.MCP); err == nil {
		t.Fatal("a rotated browser token crossed into the MCP audience")
	}
}
