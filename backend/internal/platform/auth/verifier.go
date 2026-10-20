// Package auth validates provider tokens, then exposes only a human identity.
// Current approval and roles are deliberately evaluated by transactional services.
package auth

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"github.com/auth0/go-jwt-middleware/v3/jwks"
	"github.com/auth0/go-jwt-middleware/v3/validator"
)

const EmailClaim = "https://gategoldjira.app/email"
const VerifiedEmailClaim = "https://gategoldjira.app/email_verified"

type Claims struct {
	Scope         string  `json:"scope"`
	GrantType     string  `json:"gty"`
	Email         *string `json:"https://gategoldjira.app/email"`
	EmailVerified bool    `json:"https://gategoldjira.app/email_verified"`
}

func (claims *Claims) Validate(_ context.Context) error {
	if claims.GrantType == "client-credentials" {
		return errors.New("a delegated human access token is required")
	}
	found := false
	for _, scope := range strings.Fields(claims.Scope) {
		if scope == "gategoldjira:access" {
			found = true
		}
	}
	if !found {
		return errors.New("required access scope is missing")
	}
	if claims.EmailVerified {
		if claims.Email == nil {
			return errors.New("verified email claim is missing")
		}
		address, err := mail.ParseAddress(*claims.Email)
		if err != nil || address.Address != *claims.Email || len(address.Address) > 320 {
			return errors.New("verified email claim is invalid")
		}
	}
	return nil
}

type Verifier struct {
	rest *validator.Validator
	mcp  *validator.Validator
}

func developmentKey(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, errors.New("development signing key cannot be read")
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("development signing key must be PEM")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, errors.New("development signing key must be PKCS8")
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok || rsaKey.N.BitLen() < 2048 {
		return nil, errors.New("development signing key must be RSA >=2048 bits")
	}
	return rsaKey, nil
}

func New(settings config.Config) (*Verifier, error) {
	var keyFunc func(context.Context) (any, error)
	if settings.AuthMode == config.DevelopmentAuth || settings.AuthMode == config.PasswordAuth {
		path := settings.DevSigningKeyFile
		if settings.AuthMode == config.PasswordAuth {
			if err := ValidatePasswordLoginSettings(settings); err != nil {
				return nil, err
			}
			path = settings.PasswordSigningKeyFile
		}
		readKey := developmentKey
		if settings.AuthMode == config.PasswordAuth {
			readKey = passwordSigningKey
		}
		rsaKey, err := readKey(path)
		if err != nil {
			return nil, err
		}
		keyFunc = func(context.Context) (any, error) { return &rsaKey.PublicKey, nil }
	} else {
		issuer, err := url.Parse(settings.Issuer)
		if err != nil {
			return nil, errors.New("invalid configured issuer")
		}
		provider, err := jwks.NewCachingProvider(jwks.WithIssuerURL(issuer), jwks.WithCustomClient(&http.Client{Timeout: 5 * time.Second}), jwks.WithCacheTTL(5*time.Minute), jwks.WithStrictJWKSURIOrigin())
		if err != nil {
			return nil, errors.New("signing-key provider initialization failed")
		}
		keyFunc = provider.KeyFunc
	}
	return newVerifier(settings, keyFunc)
}

func passwordSigningKey(path string) (*rsa.PrivateKey, error) {
	if !privateLoginFile(path, 16384) {
		return nil, errors.New("hosted password signing key must be a private regular file")
	}
	return developmentKey(path)
}

func newVerifier(settings config.Config, keyFunc func(context.Context) (any, error)) (*Verifier, error) {
	makeValidator := func(audience string) (*validator.Validator, error) {
		return validator.New(validator.WithKeyFunc(keyFunc), validator.WithAlgorithm(validator.RS256),
			validator.WithIssuer(settings.Issuer), validator.WithAudience(audience),
			validator.WithCustomClaims(func() validator.CustomClaims { return &Claims{} }),
			validator.WithRegisteredClaimsValidator(func(claims validator.RegisteredClaims) error {
				if claims.Subject == "" || strings.HasSuffix(claims.Subject, "@clients") || claims.Expiry <= 0 || claims.Act != nil {
					return errors.New("a non-exchanged, expiring human access token is required")
				}
				return nil
			}))
	}
	rest, err := makeValidator(settings.RESTAudience)
	if err != nil {
		return nil, err
	}
	mcp, err := makeValidator(settings.MCPAudience)
	if err != nil {
		return nil, err
	}
	return &Verifier{rest: rest, mcp: mcp}, nil
}

func (verifier *Verifier) Verify(ctx context.Context, header string, channel command.Channel) (command.ProviderIdentity, error) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || len(parts[1]) > 32768 {
		return command.ProviderIdentity{}, errors.New("a bearer access token is required")
	}
	var selected *validator.Validator
	switch channel {
	case command.REST:
		selected = verifier.rest
	case command.MCP:
		selected = verifier.mcp
	default:
		return command.ProviderIdentity{}, errors.New("invalid authentication channel")
	}
	validated, err := selected.ValidateToken(ctx, parts[1])
	if err != nil {
		return command.ProviderIdentity{}, errors.New("access token verification failed")
	}
	claims, ok := validated.(*validator.ValidatedClaims)
	if !ok {
		return command.ProviderIdentity{}, errors.New("invalid verified token claims")
	}
	custom, ok := claims.CustomClaims.(*Claims)
	if !ok {
		return command.ProviderIdentity{}, errors.New("invalid verified custom claims")
	}
	identity := command.ProviderIdentity{Issuer: claims.RegisteredClaims.Issuer, Subject: claims.RegisteredClaims.Subject}
	if custom.EmailVerified {
		identity.VerifiedEmail = custom.Email
	}
	return identity, nil
}
