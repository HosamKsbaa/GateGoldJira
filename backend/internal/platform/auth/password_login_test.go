package auth

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
)

func hostedPasswordFixture(t *testing.T) config.Config {
	t.Helper()
	settings, records := localLoginFixture(t)
	settings.Environment = config.Production
	settings.DeploymentTarget = config.VM
	settings.AuthMode = config.PasswordAuth
	settings.PasswordSigningKeyFile = settings.DevSigningKeyFile
	settings.PasswordCredentialsFile = LocalCredentialsPath(settings.DevSigningKeyFile)
	settings.DevSigningKeyFile = ""
	settings.Issuer = "https://jira.example.test/"
	settings.RESTAudience = "https://jira.example.test/api"
	settings.MCPAudience = "https://jira.example.test/mcp"
	settings.AllowedOrigins = []string{"https://jira.example.test"}
	for index := range records.Accounts {
		records.Accounts[index].Subject = "password|" + records.Accounts[index].Username
	}
	data, err := json.Marshal(records)
	if err != nil || os.WriteFile(settings.PasswordCredentialsFile, data, 0600) != nil {
		t.Fatal("hosted credentials could not be prepared")
	}
	return settings
}

func TestHostedPasswordUsesIndependentIdentityAndRESTOnlyTokens(t *testing.T) {
	settings := hostedPasswordFixture(t)
	resolve := func(_ context.Context, identity command.ProviderIdentity) (command.UserID, error) {
		if identity.Subject != "password|owner" || identity.Issuer != settings.Issuer {
			t.Fatal("hosted password used a fixture or foreign identity")
		}
		return command.NewID[command.UserKind](), nil
	}
	login, err := NewPasswordLogin(settings, resolve)
	if err != nil {
		t.Fatal(err)
	}
	session, err := login.SignIn(context.Background(), LocalCredentials{Username: "owner", Password: localTestPassword})
	if err != nil || session.AccessToken == "" {
		t.Fatal("hosted login failed", err)
	}
	verifier, err := New(settings)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifier.Verify(context.Background(), "Bearer "+session.AccessToken, command.REST); err != nil {
		t.Fatal("hosted REST identity was rejected", err)
	}
	if _, err := verifier.Verify(context.Background(), "Bearer "+session.AccessToken, command.MCP); err == nil {
		t.Fatal("browser token crossed the MCP audience boundary")
	}
	if _, err := NewLocalLogin(settings, resolve); err == nil {
		t.Fatal("production accepted the development fixture login")
	}
}

func TestHostedPasswordRejectsUnsafeTargetsOriginsFilesAndFixtures(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*config.Config)
	}{
		{"development", func(c *config.Config) { c.Environment = config.Development }},
		{"cloud", func(c *config.Config) { c.DeploymentTarget = config.CloudRun }},
		{"remote issuer", func(c *config.Config) { c.Issuer = "https://other.example.test/" }},
		{"http", func(c *config.Config) { c.Issuer = "http://jira.example.test/" }},
		{"foreign browser", func(c *config.Config) { c.AllowedOrigins = []string{"https://other.example.test"} }},
		{"public key file", func(c *config.Config) { _ = os.Chmod(c.PasswordSigningKeyFile, 0644) }},
		{"public credentials", func(c *config.Config) { _ = os.Chmod(c.PasswordCredentialsFile, 0644) }},
		{"group readable ordinary key", func(c *config.Config) {
			_ = os.Chmod(c.PasswordSigningKeyFile, 0440)
			t.Setenv("CREDENTIALS_DIRECTORY", filepath.Dir(c.PasswordSigningKeyFile))
		}},
		{"fixture subject", func(c *config.Config) {
			data, _ := os.ReadFile(c.PasswordCredentialsFile)
			var records LocalAccounts
			_ = json.Unmarshal(data, &records)
			records.Accounts[0].Subject = "local|owner"
			data, _ = json.Marshal(records)
			_ = os.WriteFile(c.PasswordCredentialsFile, data, 0600)
		}},
		{"credential symlink", func(c *config.Config) {
			link := filepath.Join(filepath.Dir(c.PasswordCredentialsFile), "linked.json")
			_ = os.Symlink(c.PasswordCredentialsFile, link)
			c.PasswordCredentialsFile = link
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			settings := hostedPasswordFixture(t)
			test.change(&settings)
			if _, err := NewPasswordLogin(settings, approvedLocalIdentity); err == nil {
				t.Fatal("unsafe hosted password configuration was accepted")
			}
		})
	}
}
