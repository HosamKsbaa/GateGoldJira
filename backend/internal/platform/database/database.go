package database

import (
	"context"
	"errors"
	"net"
	"time"

	"cloud.google.com/go/cloudsqlconn"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Database struct {
	Pool           *pgxpool.Pool
	closeConnector func() error
}

func Open(ctx context.Context, settings config.Config) (*Database, error) {
	database, err := openPool(ctx, settings)
	if err != nil {
		return nil, err
	}
	company, err := dbgen.New(database.Pool).ReadCompanySettings(ctx)
	if err != nil {
		database.Close()
		return nil, errors.New("company settings are missing; apply migrations first")
	}
	if company.TimeZone != settings.CompanyLocation.String() {
		database.Close()
		return nil, errors.New("configured company time zone differs from persisted settings")
	}
	return database, nil
}

// OpenForMigrations connects under a separate schema-owner identity before the
// company tables exist. It never starts HTTP or needs the runtime cursor secret.
func OpenForMigrations(ctx context.Context, settings config.Config) (*Database, error) {
	return openPool(ctx, settings)
}

func openPool(ctx context.Context, settings config.Config) (*Database, error) {
	poolConfig, err := pgxpool.ParseConfig(settings.DatabaseURL)
	if err != nil {
		return nil, errors.New("invalid PostgreSQL pool settings")
	}
	poolConfig.MaxConns, poolConfig.MinConns = 10, 0
	poolConfig.MaxConnIdleTime = 5 * time.Minute
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.MaxConnLifetimeJitter = time.Minute
	poolConfig.ConnConfig.ConnectTimeout = 5 * time.Second
	poolConfig.ConnConfig.RuntimeParams["timezone"] = "UTC"
	// Interactive prepared queries must not spend hundreds of milliseconds
	// compiling a fresh JIT program. The 100k-issue workload measures this
	// setting against both generic and custom plans on the application pool.
	poolConfig.ConnConfig.RuntimeParams["jit"] = "off"
	// PostgreSQL's session time zone does not control pgx's binary timestamp
	// decoder. Decode instants in UTC so JSON dates have a canonical Z suffix.
	poolConfig.AfterConnect = func(_ context.Context, conn *pgx.Conn) error {
		conn.TypeMap().RegisterType(&pgtype.Type{
			Name:  "timestamptz",
			OID:   pgtype.TimestamptzOID,
			Codec: &pgtype.TimestamptzCodec{ScanLocation: time.UTC},
		})
		return nil
	}
	database := &Database{}
	if settings.Environment == config.Production && settings.DeploymentTarget != config.VM {
		dialer, err := cloudsqlconn.NewDialer(ctx, cloudsqlconn.WithIAMAuthN(), cloudsqlconn.WithLazyRefresh())
		if err != nil {
			return nil, errors.New("Cloud SQL connector initialization failed")
		}
		database.closeConnector = dialer.Close
		// The connector authenticates and encrypts this connection itself.
		poolConfig.ConnConfig.TLSConfig = nil
		poolConfig.ConnConfig.DialFunc = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.Dial(ctx, settings.CloudSQLInstance, cloudsqlconn.WithPublicIP())
		}
	}
	database.Pool, err = pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		database.Close()
		return nil, err
	}
	if err := database.Pool.Ping(ctx); err != nil {
		database.Close()
		return nil, errors.New("database connection failed")
	}
	return database, nil
}

func (database *Database) Close() {
	if database.Pool != nil {
		database.Pool.Close()
	}
	if database.closeConnector != nil {
		_ = database.closeConnector()
	}
}
