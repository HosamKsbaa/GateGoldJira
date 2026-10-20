package mcptokens

import (
	"testing"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
)

func TestSharedBrowserOAuthRequiresHTTPSAndVerifiedBrowserIdentities(t *testing.T) {
	settings := config.Config{Environment: config.Production, AuthMode: config.OIDC, MCPBrowserOAuthEnabled: true,
		MCPAudience: "https://api.example.test/mcp", NotificationAppURL: "https://jira.example.test"}
	service := New(command.Runner{}, settings.MCPAudience)
	if err := service.WithBrowserOAuth(settings); err != nil {
		t.Fatal(err)
	}
	if service.OAuthIssuer("unrelated") != "https://api.example.test/oauth" {
		t.Fatal("broker issuer is not canonical")
	}
	for _, change := range []func(*config.Config){
		func(c *config.Config) { c.MCPBrowserOAuthEnabled = false },
		func(c *config.Config) { c.AuthMode = config.DevelopmentAuth },
		func(c *config.Config) { c.MCPAudience = "http://api.example.test/mcp" },
		func(c *config.Config) { c.NotificationAppURL = "http://jira.example.test" },
		func(c *config.Config) { c.NotificationAppURL = "https://user:secret@jira.example.test" },
	} {
		invalid := settings
		change(&invalid)
		if err := New(command.Runner{}, invalid.MCPAudience).WithBrowserOAuth(invalid); err == nil {
			t.Fatal("unsafe shared OAuth settings accepted")
		}
	}
}
