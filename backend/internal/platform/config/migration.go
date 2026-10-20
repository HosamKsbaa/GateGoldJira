package config

import (
	"errors"
	"net/url"
	"os"
)

func LoadMigration() (Config, error) {
	c := Config{
		Environment:      Environment(os.Getenv("APP_ENV")),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		CloudSQLInstance: os.Getenv("CLOUD_SQL_INSTANCE"),
		DeploymentTarget: DeploymentTarget(value("DEPLOYMENT_TARGET", "cloud-run")),
	}
	u, err := url.Parse(c.DatabaseURL)
	if err != nil || u.Host == "" || u.Path == "" || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return c, errors.New("a PostgreSQL migration connection URL is required")
	}
	switch c.Environment {
	case Production:
		if c.DeploymentTarget != VM && c.DeploymentTarget != CloudRun || os.Getenv("K_SERVICE") != "" && c.DeploymentTarget != CloudRun {
			return c, errors.New("invalid production migration target")
		}
		if err := validateProductionDatabase(c, u); err != nil {
			return c, err
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
