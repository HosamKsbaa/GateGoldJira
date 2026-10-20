package auth

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"io"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/config"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/time/rate"
)

type LocalCredentials struct {
	Username string `json:"username" minLength:"1" maxLength:"64"`
	Password string `json:"password" minLength:"1" maxLength:"72" writeOnly:"true"`
}

type LocalSession struct {
	AccessToken string    `json:"accessToken" minLength:"1"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

type LocalAccount struct {
	Username     string `json:"username"`
	PasswordHash string `json:"passwordHash"`
	Subject      string `json:"subject"`
	Email        string `json:"email"`
}

type LocalAccounts struct {
	Accounts []LocalAccount `json:"accounts"`
}

// LocalLogin is a development adapter to the same signed identity and current
// company permissions as REST/MCP. It is never registered for production.
type LocalLogin struct {
	accounts []LocalAccount
	key      *rsa.PrivateKey
	settings config.Config
	resolve  ResolveIdentity
	limiter  *rate.Limiter
	capacity chan struct{}
}

func LocalCredentialsPath(keyPath string) string {
	return filepath.Join(filepath.Dir(keyPath), "credentials.json")
}

func ValidateLocalLoginSettings(settings config.Config) error {
	if settings.Environment != config.Development || settings.AuthMode != config.DevelopmentAuth || settings.StorageMode != config.LocalStorage || os.Getenv("K_SERVICE") != "" {
		return errors.New("password fixtures require explicit local development")
	}
	urls := append([]string{
		settings.DatabaseURL,
		settings.Issuer,
		settings.RESTAudience,
		settings.MCPAudience,
	}, settings.AllowedOrigins...)
	for _, text := range urls {
		parsed, err := url.Parse(text)
		if err != nil || (parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "::1") {
			return errors.New("password fixtures require loopback services")
		}
	}
	return nil
}

var localUsername = regexp.MustCompile(`^[a-z][a-z0-9._-]{0,63}$`)

func NewLocalLogin(settings config.Config, resolve ResolveIdentity) (*LocalLogin, error) {
	if err := ValidateLocalLoginSettings(settings); err != nil {
		return nil, err
	}
	return newPasswordLogin(settings, resolve, LocalCredentialsPath(settings.DevSigningKeyFile), settings.DevSigningKeyFile, "local|")
}

// Hosted password accounts are provisioned by an operator, independently of
// development fixtures. Only the production VM target may expose this adapter.
func ValidatePasswordLoginSettings(settings config.Config) error {
	if settings.Environment != config.Production || settings.DeploymentTarget != config.VM || settings.AuthMode != config.PasswordAuth || os.Getenv("K_SERVICE") != "" {
		return errors.New("hosted password login requires explicit production VM configuration")
	}
	issuer, err := url.Parse(settings.Issuer)
	if err != nil || issuer.Scheme != "https" || issuer.Host == "" || issuer.Path != "/" || issuer.User != nil || issuer.RawQuery != "" || issuer.Fragment != "" {
		return errors.New("hosted password login requires its canonical HTTPS issuer")
	}
	origin := strings.TrimSuffix(settings.Issuer, "/")
	if settings.RESTAudience != origin+"/api" || settings.MCPAudience != origin+"/mcp" || len(settings.AllowedOrigins) != 1 || settings.AllowedOrigins[0] != origin {
		return errors.New("hosted password login requires one exact HTTPS application and service origin")
	}
	if !filepath.IsAbs(settings.PasswordSigningKeyFile) || !filepath.IsAbs(settings.PasswordCredentialsFile) || settings.PasswordSigningKeyFile == settings.DevSigningKeyFile || settings.PasswordCredentialsFile == LocalCredentialsPath(settings.DevSigningKeyFile) {
		return errors.New("hosted password login requires independent absolute private credential paths")
	}
	return nil
}

func NewPasswordLogin(settings config.Config, resolve ResolveIdentity) (*LocalLogin, error) {
	if err := ValidatePasswordLoginSettings(settings); err != nil {
		return nil, err
	}
	return newPasswordLogin(settings, resolve, settings.PasswordCredentialsFile, settings.PasswordSigningKeyFile, "password|")
}

func newPasswordLogin(settings config.Config, resolve ResolveIdentity, path, keyPath, subjectPrefix string) (*LocalLogin, error) {
	if resolve == nil {
		return nil, errors.New("local sign-in requires current identity authorization")
	}
	if !privateLoginFile(path, 64*1024) {
		return nil, errors.New("private local password fixtures are missing; run make db-seed")
	}
	directory, err := os.Lstat(filepath.Dir(path))
	if err != nil || !directory.IsDir() || directory.Mode().Perm()&0077 != 0 && !systemdCredentialDirectory(filepath.Dir(path), directory) {
		return nil, errors.New("local password directory must be private")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, errors.New("local password fixtures cannot be read")
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 64*1024))
	decoder.DisallowUnknownFields()
	var records LocalAccounts
	if decoder.Decode(&records) != nil || decoder.Decode(new(json.RawMessage)) != io.EOF || len(records.Accounts) == 0 || len(records.Accounts) > 50 {
		return nil, errors.New("invalid local password fixture file")
	}
	seen := make(map[string]bool, len(records.Accounts))
	for _, account := range records.Accounts {
		cost, err := bcrypt.Cost([]byte(account.PasswordHash))
		address, mailErr := mail.ParseAddress(account.Email)
		if !localUsername.MatchString(account.Username) || seen[account.Username] || account.Subject != subjectPrefix+account.Username || err != nil || cost < bcrypt.DefaultCost || cost > 14 || mailErr != nil || address.Address != account.Email {
			return nil, errors.New("invalid local password fixture record")
		}
		seen[account.Username] = true
	}
	readKey := developmentKey
	if settings.AuthMode == config.PasswordAuth {
		readKey = passwordSigningKey
	}
	key, err := readKey(keyPath)
	if err != nil {
		return nil, err
	}
	return &LocalLogin{accounts: records.Accounts, key: key, settings: settings, resolve: resolve,
		limiter: rate.NewLimiter(2, 20), capacity: make(chan struct{}, 2)}, nil
}

func invalidLocalCredentials() error {
	return &command.Failure{
		Code:        command.Unauthenticated,
		Message:     "The username or password is incorrect.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.SignIn,
	}
}

func (login *LocalLogin) SignIn(ctx context.Context, input LocalCredentials) (LocalSession, error) {
	if !login.limiter.Allow() {
		return LocalSession{}, localLoginBusy()
	}
	select {
	case login.capacity <- struct{}{}:
		defer func() { <-login.capacity }()
	default:
		return LocalSession{}, localLoginBusy()
	}
	username := strings.ToLower(strings.TrimSpace(input.Username))
	selected, found := login.accounts[0], false
	for _, account := range login.accounts {
		if account.Username == username {
			selected, found = account, true
			break
		}
	}
	// Unknown usernames still pay the same hash cost. Passwords are never trimmed.
	err := bcrypt.CompareHashAndPassword([]byte(selected.PasswordHash), []byte(input.Password))
	if err != nil || !found || len(input.Password) == 0 || len(input.Password) > 72 {
		return LocalSession{}, invalidLocalCredentials()
	}
	if err := ctx.Err(); err != nil {
		return LocalSession{}, err
	}
	identity := command.ProviderIdentity{
		Issuer:        login.settings.Issuer,
		Subject:       selected.Subject,
		VerifiedEmail: &selected.Email,
	}
	if _, err := login.resolve(ctx, identity); err != nil {
		return LocalSession{}, err
	}
	now := time.Now().UTC().Truncate(time.Second)
	claims := struct {
		jwt.RegisteredClaims
		Claims
	}{RegisteredClaims: jwt.RegisteredClaims{Issuer: identity.Issuer, Subject: identity.Subject, Audience: jwt.ClaimStrings{login.settings.RESTAudience},
		IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour))},
		Claims: Claims{Scope: login.settings.RequiredScope, Email: &selected.Email, EmailVerified: true}}
	token, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(login.key)
	if err != nil {
		return LocalSession{}, err
	}
	return LocalSession{AccessToken: token, ExpiresAt: now.Add(time.Hour)}, nil
}

func localLoginBusy() error {
	return &command.Failure{
		Code:        command.Busy,
		Message:     "Sign-in is busy. Wait a moment and try again.",
		FieldErrors: []command.FieldError{},
		Retryable:   true,
		NextAction:  command.SignIn,
	}
}
