package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/config"
	"golang.org/x/crypto/bcrypt"
)

type fixturePassword struct {
	Username string `json:"username"`
	Password string `json:"password"`
}
type fixturePasswords struct {
	Accounts []fixturePassword `json:"accounts"`
}

// The private account handout is ignored by Git and never served by the API.
// Re-running fixture commands preserves both passwords and existing roles.
func writeFixturePasswords() error {
	settings, err := config.Load()
	if err != nil {
		return err
	}
	if err := auth.ValidateLocalLoginSettings(settings); err != nil {
		return err
	}
	credentialsPath := auth.LocalCredentialsPath(settings.DevSigningKeyFile)
	if _, err := os.Stat(credentialsPath); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	passwordsPath := filepath.Join(filepath.Dir(credentialsPath), "accounts.json")
	data, err := os.ReadFile(passwordsPath)
	if errors.Is(err, os.ErrNotExist) {
		passwords := fixturePasswords{Accounts: []fixturePassword{}}
		for _, user := range fixtureUsers() {
			secret := make([]byte, 20)
			if _, err := rand.Read(secret); err != nil {
				return err
			}
			passwords.Accounts = append(passwords.Accounts, fixturePassword{
				Username: strings.TrimPrefix(user.Subject, "local|"),
				Password: base64.RawURLEncoding.EncodeToString(secret),
			})
		}
		data, err = json.MarshalIndent(passwords, "", "  ")
		if err != nil {
			return err
		}
		if err := createSecret(passwordsPath, data); err != nil {
			return err
		}
		data, err = os.ReadFile(passwordsPath)
		if err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	var passwords fixturePasswords
	if err := json.Unmarshal(data, &passwords); err != nil || len(passwords.Accounts) != len(fixtureUsers()) {
		return errors.New("invalid private local account handout")
	}
	credentials := auth.LocalAccounts{Accounts: []auth.LocalAccount{}}
	for _, user := range fixtureUsers() {
		username := strings.TrimPrefix(user.Subject, "local|")
		var password string
		for _, account := range passwords.Accounts {
			if account.Username == username {
				password = account.Password
				break
			}
		}
		if len(password) < 16 || len(password) > 72 {
			return errors.New("invalid local fixture password")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		credentials.Accounts = append(credentials.Accounts, auth.LocalAccount{
			Username:     username,
			PasswordHash: string(hash),
			Subject:      user.Subject,
			Email:        user.Email,
		})
	}
	encoded, err := json.MarshalIndent(credentials, "", "  ")
	if err != nil {
		return err
	}
	return createSecret(credentialsPath, encoded)
}
