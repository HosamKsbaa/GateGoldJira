package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"github.com/golang-jwt/jwt/v5"
)

type tokenClaims struct {
	jwt.RegisteredClaims
	Claims
}

func TestHumanTokenAudiencesScopeExpiryAndTrustedEmail(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	settings := config.Config{
		Issuer:       "https://company.auth0.com/",
		RESTAudience: "https://service.example/api",
		MCPAudience:  "https://service.example/mcp",
	}
	verifier, err := newVerifier(settings, func(context.Context) (any, error) { return &key.PublicKey, nil })
	if err != nil {
		t.Fatal(err)
	}
	email := "member@example.test"
	base := tokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    settings.Issuer,
			Subject:   "google-oauth2|123",
			Audience:  jwt.ClaimStrings{settings.RESTAudience},
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
		},
		Claims: Claims{
			Scope:         "gategoldjira:access",
			Email:         &email,
			EmailVerified: true,
		},
	}
	sign := func(claims tokenClaims) string {
		encoded, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return "Bearer " + encoded
	}
	identity, err := verifier.Verify(context.Background(), sign(base), command.REST)
	if err != nil || identity.Subject != base.Subject || identity.VerifiedEmail == nil || *identity.VerifiedEmail != email {
		t.Fatalf("valid human identity rejected: %v", err)
	}
	if _, err := verifier.Verify(context.Background(), sign(base), command.MCP); err == nil {
		t.Fatal("REST token crossed the MCP audience boundary")
	}
	cases := []struct {
		name   string
		change func(*tokenClaims)
	}{
		{"missing scope", func(c *tokenClaims) { c.Scope = "openid" }},
		{"expired", func(c *tokenClaims) { c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute)) }},
		{"no expiry", func(c *tokenClaims) { c.ExpiresAt = nil }},
		{"foreign issuer", func(c *tokenClaims) { c.Issuer = "https://accounts.google.com/" }},
		{"ID token", func(c *tokenClaims) { c.Audience = jwt.ClaimStrings{"web-client-id"} }},
		{"client credentials", func(c *tokenClaims) { c.GrantType = "client-credentials" }},
		{"client subject", func(c *tokenClaims) { c.Subject = "client@clients" }},
		{"missing human subject", func(c *tokenClaims) { c.Subject = "" }},
		{"invalid verified email", func(c *tokenClaims) { bad := "not-email"; c.Email = &bad }},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			claims := base
			test.change(&claims)
			if _, err := verifier.Verify(context.Background(), sign(claims), command.REST); err == nil {
				t.Fatal("invalid access token accepted")
			}
		})
	}
	unverified := base
	unverified.EmailVerified = false
	identity, err = verifier.Verify(context.Background(), sign(unverified), command.REST)
	if err != nil || identity.VerifiedEmail != nil {
		t.Fatal("unverified email can be used for first binding")
	}
}
