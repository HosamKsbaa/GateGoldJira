package config

import (
	"errors"
	"net/url"
	"os"
	"strings"
)

func LoadMigration() (Config, error) {
	c := Config{
		Environment:      Environment(os.Getenv("APP_ENV")),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		CloudSQLInstance: os.Getenv("CLOUD_SQL_INSTANCE"),
	}
	u, err := url.Parse(c.DatabaseURL)
	if err != nil || u.Host == "" || u.Path == "" || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return c, errors.New("a PostgreSQL migration connection URL is required")
	}
	switch c.Environment {
	case Production:
		parts := strings.Split(c.CloudSQLInstance, ":")
		if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" || u.User == nil || u.User.Username() == "" {
			return c, errors.New("production migration requires the Cloud SQL connector and IAM schema-owner identity")
		}
		if _, ok := u.User.Password(); ok {
			return c, errors.New("production migration must use password-free IAM authentication")
		}
	case Development, Test:
		if os.Getenv("K_SERVICE") != "" || c.CloudSQLInstance != "" {
			return c, errors.New("Cloud Run migrations require production configuration")
		}
		host := u.Hostname()
		if host != "localhost" && host != "127.0.0.1" && host != "::1" {
			return c, errors.New("local migration requires a loopback database")
		}
	default:
		return c, errors.New("migration requires an explicit application environment")
	}
	return c, nil
}
