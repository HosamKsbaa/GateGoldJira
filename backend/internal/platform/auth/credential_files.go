package auth

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// systemd may expose root-owned 0440 credentials through a read-only, per-unit
// credential mount with an ACL for the service user. Ordinary files still
// require owner-only permissions; setting this environment variable alone is
// insufficient to relax checks outside the root-owned credential mount.
func systemdCredentialDirectory(path string, info os.FileInfo) bool {
	directory := os.Getenv("CREDENTIALS_DIRECTORY")
	owner, ok := info.Sys().(*syscall.Stat_t)
	return ok && owner.Uid == 0 && path == directory && filepath.IsAbs(path) &&
		filepath.Clean(path) == path && strings.HasPrefix(path, "/run/credentials/") &&
		info.IsDir() && info.Mode().Perm()&0227 == 0
}

func privateLoginFile(path string, maximum int64) bool {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > maximum {
		return false
	}
	if info.Mode().Perm()&0077 == 0 {
		return true
	}
	owner, ok := info.Sys().(*syscall.Stat_t)
	directory, err := os.Lstat(filepath.Dir(path))
	return err == nil && ok && owner.Uid == 0 && (owner.Gid == 0 || owner.Gid == uint32(os.Getegid())) &&
		info.Mode().Perm()&0237 == 0 && systemdCredentialDirectory(filepath.Dir(path), directory)
}
