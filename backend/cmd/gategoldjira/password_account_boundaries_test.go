package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/auth"
	"golang.org/x/crypto/bcrypt"
)

const operatorBoundaryPassword = "operator-test-password-only"

func operatorBoundaryEnvironment(t *testing.T) string {
	t.Helper()
	directory := t.TempDir()
	if err := os.Chmod(directory, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, "accounts.json")
	for key, value := range map[string]string{
		"APP_ENV": "production", "DEPLOYMENT_TARGET": "vm", "AUTH_MODE": "password",
		"K_SERVICE": "", "PASSWORD_CREDENTIALS_FILE": path,
	} {
		t.Setenv(key, value)
	}
	return path
}

func operatorBoundaryArgs() []string {
	return []string{"--username", "owner", "--email", "owner@example.test"}
}

type operatorBoundaryReader struct{ reads int }

func (reader *operatorBoundaryReader) Read([]byte) (int, error) {
	reader.reads++
	return 0, errors.New("private-input-error-marker")
}

func TestPasswordOperatorBoundaryRejectsWrongTargetBeforeReadingInput(t *testing.T) {
	for _, test := range []struct{ name, key, value string }{
		{"development", "APP_ENV", "development"},
		{"test", "APP_ENV", "test"},
		{"cloud-target", "DEPLOYMENT_TARGET", "cloud-run"},
		{"provider-mode", "AUTH_MODE", "oidc"},
		{"cloud-runtime", "K_SERVICE", "service"},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := operatorBoundaryEnvironment(t)
			t.Setenv(test.key, test.value)
			reader := &operatorBoundaryReader{}
			if err := savePasswordAccount(operatorBoundaryArgs(), reader); err == nil {
				t.Fatal("unsafe provisioning target was accepted")
			}
			if reader.reads != 0 {
				t.Fatal("a rejected target consumed its password")
			}
			if _, err := os.Stat(path); !os.IsNotExist(err) {
				t.Fatal("a rejected target created credentials")
			}
		})
	}
}

func TestPasswordOperatorBoundaryRejectsInvalidInputWithoutSavingOrEchoing(t *testing.T) {
	for _, test := range []struct {
		name  string
		args  []string
		input func() io.Reader
	}{
		{"unknown-flag", []string{"--password", "not-an-accepted-option"}, func() io.Reader { return strings.NewReader(operatorBoundaryPassword) }},
		{"missing-username", []string{"--email", "owner@example.test"}, func() io.Reader { return strings.NewReader(operatorBoundaryPassword) }},
		{"missing-email", []string{"--username", "owner"}, func() io.Reader { return strings.NewReader(operatorBoundaryPassword) }},
		{"reader-error", operatorBoundaryArgs(), func() io.Reader { return &operatorBoundaryReader{} }},
		{"bounded-input", operatorBoundaryArgs(), func() io.Reader { return strings.NewReader(strings.Repeat("x", 1024)) }},
		{"short-password", operatorBoundaryArgs(), func() io.Reader { return strings.NewReader("short") }},
		{"embedded-line", operatorBoundaryArgs(), func() io.Reader { return strings.NewReader("operator-password\nembedded") }},
		{"null-byte", operatorBoundaryArgs(), func() io.Reader { return strings.NewReader("operator-password\x00embedded") }},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := operatorBoundaryEnvironment(t)
			err := savePasswordAccount(test.args, test.input())
			if err == nil {
				t.Fatal("invalid provisioning input was accepted")
			}
			for _, secret := range []string{operatorBoundaryPassword, "private-input-error-marker"} {
				if strings.Contains(err.Error(), secret) {
					t.Fatal("input failure exposed private data")
				}
			}
			if _, err := os.Stat(path); !os.IsNotExist(err) {
				t.Fatal("invalid input created credentials")
			}
		})
	}
}

func TestPasswordOperatorBoundaryPrivatePathsAndInvalidFilesPreserveOriginalBytes(t *testing.T) {
	for _, test := range []struct {
		name  string
		setup func(*testing.T, string) string
	}{
		{"relative-path", func(t *testing.T, path string) string { return "relative-accounts.json" }},
		{"missing-parent", func(t *testing.T, path string) string {
			return filepath.Join(filepath.Dir(path), "missing", "accounts.json")
		}},
		{"public-parent", func(t *testing.T, path string) string {
			if err := os.Chmod(filepath.Dir(path), 0755); err != nil {
				t.Fatal(err)
			}
			return path
		}},
		{"public-file", func(t *testing.T, path string) string {
			if err := os.Chmod(path, 0644); err != nil {
				t.Fatal(err)
			}
			return path
		}},
		{"symlink-file", func(t *testing.T, path string) string {
			link := filepath.Join(filepath.Dir(path), "link.json")
			if err := os.Symlink(path, link); err != nil {
				t.Fatal(err)
			}
			return link
		}},
		{"directory-file", func(t *testing.T, path string) string {
			directory := filepath.Join(filepath.Dir(path), "directory.json")
			if err := os.Mkdir(directory, 0700); err != nil {
				t.Fatal(err)
			}
			return directory
		}},
		{"oversized-file", func(t *testing.T, path string) string {
			if err := os.WriteFile(path, bytes.Repeat([]byte(" "), 64*1024+1), 0600); err != nil {
				t.Fatal(err)
			}
			return path
		}},
		{"malformed-json", func(t *testing.T, path string) string {
			if err := os.WriteFile(path, []byte("{"), 0600); err != nil {
				t.Fatal(err)
			}
			return path
		}},
		{"unknown-json-field", func(t *testing.T, path string) string {
			if err := os.WriteFile(path, []byte("{\"accounts\":[],\"private\":\"private-file-marker\"}"), 0600); err != nil {
				t.Fatal(err)
			}
			return path
		}},
		{"trailing-json", func(t *testing.T, path string) string {
			if err := os.WriteFile(path, []byte("{\"accounts\":[]} {}"), 0600); err != nil {
				t.Fatal(err)
			}
			return path
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := operatorBoundaryEnvironment(t)
			if err := os.WriteFile(path, []byte("{\"accounts\":[]}"), 0600); err != nil {
				t.Fatal(err)
			}
			target := test.setup(t, path)
			before, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			t.Setenv("PASSWORD_CREDENTIALS_FILE", target)
			err = savePasswordAccount(operatorBoundaryArgs(), strings.NewReader(operatorBoundaryPassword))
			if err == nil {
				t.Fatal("unsafe credential destination was accepted")
			}
			if strings.Contains(err.Error(), operatorBoundaryPassword) || strings.Contains(err.Error(), "private-file-marker") {
				t.Fatal("credential rejection echoed private material")
			}
			after, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(before, after) {
				t.Fatal("rejected update changed original credential bytes")
			}
			staged, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".password-accounts-*"))
			if err != nil || len(staged) != 0 {
				t.Fatal("rejected update retained staging credentials")
			}
		})
	}
}

func TestPasswordOperatorBoundaryCapacityAndIdentitySafeRotation(t *testing.T) {
	path := operatorBoundaryEnvironment(t)
	hash, err := bcrypt.GenerateFromPassword([]byte(operatorBoundaryPassword), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	records := auth.LocalAccounts{}
	for index := range 50 {
		name := "member" + string(rune('a'+index/26)) + string(rune('a'+index%26))
		records.Accounts = append(records.Accounts, auth.LocalAccount{
			Username: name, Email: name + "@example.test", Subject: "password|" + name, PasswordHash: string(hash),
		})
	}
	original, err := json.Marshal(records)
	if err != nil || os.WriteFile(path, original, 0600) != nil {
		t.Fatal("cannot prepare bounded fixture")
	}
	if err := savePasswordAccount(operatorBoundaryArgs(), strings.NewReader(operatorBoundaryPassword)); err == nil {
		t.Fatal("the fifty-first account was accepted")
	}
	unchanged, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(original, unchanged) {
		t.Fatal("capacity rejection changed credentials")
	}
	account := records.Accounts[0]
	for _, test := range []struct {
		name   string
		change func(*auth.LocalAccount)
	}{
		{"email-rebinding", func(a *auth.LocalAccount) { a.Email = "other@example.test" }},
		{"subject-rebinding", func(a *auth.LocalAccount) { a.Subject = "password|different" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			altered := records
			altered.Accounts = append([]auth.LocalAccount(nil), records.Accounts...)
			test.change(&altered.Accounts[0])
			data, _ := json.Marshal(altered)
			if err := os.WriteFile(path, data, 0600); err != nil {
				t.Fatal(err)
			}
			args := []string{"--username", account.Username, "--email", account.Email}
			if err := savePasswordAccount(args, strings.NewReader(operatorBoundaryPassword)); err == nil {
				t.Fatal("rotation rebound an existing company identity")
			}
			after, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(data, after) {
				t.Fatal("identity rejection changed credentials")
			}
		})
	}
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	newPassword := "rotated-operator-password"
	args := []string{"--username", account.Username, "--email", account.Email}
	if err := savePasswordAccount(args, strings.NewReader(newPassword+"\r\n")); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var saved auth.LocalAccounts
	if json.Unmarshal(data, &saved) != nil || len(saved.Accounts) != 50 {
		t.Fatal("rotation changed account count")
	}
	if saved.Accounts[0].Subject != account.Subject || saved.Accounts[0].Email != account.Email ||
		bcrypt.CompareHashAndPassword([]byte(saved.Accounts[0].PasswordHash), []byte(newPassword)) != nil {
		t.Fatal("rotation failed to preserve identity or normalize terminal newline")
	}
	if bcrypt.CompareHashAndPassword([]byte(saved.Accounts[0].PasswordHash), []byte(operatorBoundaryPassword)) == nil {
		t.Fatal("rotation retained the old password")
	}
	for index := 1; index < len(saved.Accounts); index++ {
		if saved.Accounts[index] != records.Accounts[index] {
			t.Fatal("rotation changed another account")
		}
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 || bytes.Contains(data, []byte(newPassword)) {
		t.Fatal("rotation exposed plaintext credentials")
	}
}
