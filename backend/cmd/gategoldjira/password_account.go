package main

import (
	"encoding/json"
	"errors"
	"flag"
	"io"
	"os"
	"path/filepath"
	"strings"

	"gategoldjira/backend/internal/platform/auth"
)

// Passwords come from stdin, never arguments, environment variables or logs.
// Operator filesystem access is the authority to provision/rotate credentials.
func savePasswordAccount(args []string, input io.Reader) error {
	if os.Getenv("APP_ENV") != "production" || os.Getenv("DEPLOYMENT_TARGET") != "vm" || os.Getenv("AUTH_MODE") != "password" || os.Getenv("K_SERVICE") != "" {
		return errors.New("password provisioning requires the explicit production VM password target")
	}
	flags := flag.NewFlagSet("password-account", flag.ContinueOnError)
	username := flags.String("username", "", "company username")
	email := flags.String("email", "", "approved company email")
	if err := flags.Parse(args); err != nil {
		return errors.New("supply --username and --email; send the password through stdin")
	}
	data, err := io.ReadAll(io.LimitReader(input, 1024))
	if err != nil || len(data) == 1024 {
		return errors.New("a bounded password must be supplied through stdin")
	}
	account, err := auth.PasswordAccount(*username, *email, strings.TrimSuffix(strings.TrimSuffix(string(data), "\n"), "\r"))
	if err != nil {
		return err
	}
	path := os.Getenv("PASSWORD_CREDENTIALS_FILE")
	if !filepath.IsAbs(path) {
		return errors.New("an absolute private credential file is required")
	}
	directory, err := os.Stat(filepath.Dir(path))
	if err != nil || !directory.IsDir() || directory.Mode().Perm()&0077 != 0 {
		return errors.New("the operator credential directory must exist and be private")
	}
	records := auth.LocalAccounts{Accounts: []auth.LocalAccount{}}
	info, err := os.Lstat(path)
	if err == nil {
		if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > 64*1024 {
			return errors.New("the existing credential file must be private, regular and bounded")
		}
		file, err := os.Open(path)
		if err != nil {
			return errors.New("existing credentials cannot be read")
		}
		defer file.Close()
		decoder := json.NewDecoder(io.LimitReader(file, 64*1024))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&records) != nil || decoder.Decode(new(json.RawMessage)) != io.EOF {
			return errors.New("existing credentials are invalid")
		}
	} else if !os.IsNotExist(err) {
		return errors.New("the credential file cannot be inspected")
	}
	replaced := false
	for index, existing := range records.Accounts {
		if existing.Username == account.Username {
			if existing.Email != account.Email || existing.Subject != account.Subject {
				return errors.New("password rotation must preserve the existing account identity")
			}
			records.Accounts[index] = account
			replaced = true
		}
	}
	if !replaced {
		records.Accounts = append(records.Accounts, account)
	}
	if len(records.Accounts) > 50 {
		return errors.New("the operator credential file supports at most 50 accounts")
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".password-accounts-")
	if err != nil {
		return errors.New("credentials cannot be staged")
	}
	defer os.Remove(temporary.Name())
	if err = json.NewEncoder(temporary).Encode(records); err == nil {
		err = temporary.Sync()
	}
	closeErr := temporary.Close()
	if err != nil || closeErr != nil || os.Rename(temporary.Name(), path) != nil {
		return errors.New("credentials could not be saved atomically")
	}
	return nil
}
