package auth

import (
	"errors"
	"net/mail"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// PasswordAccount creates an operator-provisioned identity, never a fixture or
// a self-registration. Approval is checked independently on every login/call.
func PasswordAccount(username, email, password string) (LocalAccount, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	email = strings.ToLower(strings.TrimSpace(email))
	address, err := mail.ParseAddress(email)
	if !localUsername.MatchString(username) || err != nil || address.Address != email || len(email) > 320 {
		return LocalAccount{}, errors.New("a valid username and exact account email are required")
	}
	if len(password) < 16 || len(password) > 72 || strings.ContainsAny(password, "\r\n\x00") {
		return LocalAccount{}, errors.New("passwords must contain 16 to 72 bytes without line breaks")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return LocalAccount{}, errors.New("password hashing failed")
	}
	return LocalAccount{Username: username, Email: email, Subject: "password|" + username, PasswordHash: string(hash)}, nil
}
