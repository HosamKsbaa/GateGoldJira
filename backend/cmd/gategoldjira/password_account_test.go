package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/auth"
	"golang.org/x/crypto/bcrypt"
)

func TestPasswordProvisioningIsPrivateAtomicAndKeepsIdentityOnRotation(t *testing.T) {
	directory := t.TempDir()
	if err := os.Chmod(directory, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, "credentials.json")
	t.Setenv("APP_ENV", "production")
	t.Setenv("DEPLOYMENT_TARGET", "vm")
	t.Setenv("AUTH_MODE", "password")
	t.Setenv("K_SERVICE", "")
	t.Setenv("PASSWORD_CREDENTIALS_FILE", path)
	args := []string{"--username", "admin", "--email", "admin@example.test"}
	password := "production-password-for-tests"
	if err := savePasswordAccount(args, strings.NewReader(password+"\n")); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || strings.Contains(string(data), password) {
		t.Fatal("plaintext password was retained", err)
	}
	var records auth.LocalAccounts
	if json.Unmarshal(data, &records) != nil || len(records.Accounts) != 1 {
		t.Fatal("invalid provisioned account")
	}
	if records.Accounts[0].Subject != "password|admin" || bcrypt.CompareHashAndPassword([]byte(records.Accounts[0].PasswordHash), []byte(password)) != nil {
		t.Fatal("invalid hosted identity/hash")
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Fatal("credentials are not private")
	}
	if err := savePasswordAccount(args, strings.NewReader("rotated-password-for-tests")); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	if err := savePasswordAccount([]string{"--username", "admin", "--email", "other@example.test"}, strings.NewReader(password)); err == nil {
		t.Fatal("rotation changed account identity")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("failed provisioning rewrote credentials")
	}
	t.Setenv("APP_ENV", "development")
	if err := savePasswordAccount(args, strings.NewReader(password)); err == nil {
		t.Fatal("development provisioned a hosted account")
	}
}
