// Package mcpclient provides the pinned official SDK reference client. Its
// OAuth flow uses either the configured managed issuer or the explicitly
// loopback development adapter.
package mcpclient

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"slices"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
	"golang.org/x/oauth2"
)

type ReferenceConfig struct {
	Endpoint           string
	Issuer             string
	ClientID           string
	RedirectURL        string
	ProtocolVersion    string
	FetchCode          auth.AuthorizationCodeFetcher
	HTTPClient         *http.Client
	InitialTokenSource oauth2.TokenSource
}
type ReferenceClient struct {
	endpoint string
	version  string
	oauth    *auth.AuthorizationCodeHandler
	http     *http.Client
}

func allowedURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && u.Host != "" && u.User == nil && u.Fragment == "" && (u.Scheme == "https" || (u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1")))
}
func NewReferenceClient(settings ReferenceConfig) (*ReferenceClient, error) {
	if !allowedURL(settings.Endpoint) || !allowedURL(settings.Issuer) || !allowedURL(settings.RedirectURL) || settings.ClientID == "" || !slices.Contains([]string{"2025-11-25", "2026-07-28"}, settings.ProtocolVersion) {
		return nil, errors.New("valid registered public client URLs, issuer and declared protocol are required")
	}
	handler, err := auth.NewAuthorizationCodeHandler(&auth.AuthorizationCodeHandlerConfig{PreregisteredClient: &oauthex.ClientCredentials{
		ClientID: settings.ClientID,
		Issuer:   settings.Issuer,
	}, RedirectURL: settings.RedirectURL, AuthorizationCodeFetcher: settings.FetchCode, Client: settings.HTTPClient, ScopeFilter: func(scopes []string) []string {
		if slices.Contains(scopes, "gategoldjira:access") {
			return []string{"gategoldjira:access"}
		}
		return []string{}
	}, RequestRefreshToken: false, InitialTokenSource: settings.InitialTokenSource})
	if err != nil {
		return nil, err
	}
	return &ReferenceClient{settings.Endpoint, settings.ProtocolVersion, handler, settings.HTTPClient}, nil
}
func (c *ReferenceClient) Connect(ctx context.Context) (*mcp.ClientSession, error) {
	client := mcp.NewClient(&mcp.Implementation{Name: "GateGoldJira reference client", Version: "go-sdk-1.8.0"}, nil)
	return client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint:     c.endpoint,
		HTTPClient:   c.http,
		OAuthHandler: c.oauth,
	}, &mcp.ClientSessionOptions{ProtocolVersion: c.version})
}
