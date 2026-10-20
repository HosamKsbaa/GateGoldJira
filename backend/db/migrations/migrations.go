// Package migrations embeds the ordered schema for isolated tests and CLI use.
package migrations

import (
	"context"
	"embed"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed *.sql
var Files embed.FS

func Apply(ctx context.Context, pool *pgxpool.Pool) error { return apply(ctx, pool, true) }

// Expand completes the restartable compatibility phase without retiring storage.
// Historical fixture checks and the documented cutover use this owner-only step.
func Expand(ctx context.Context, pool *pgxpool.Pool) error { return apply(ctx, pool, false) }
func apply(ctx context.Context, pool *pgxpool.Pool, retire bool) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, db, Files)
	if err != nil {
		return err
	}
	var retired bool
	if err = pool.QueryRow(ctx, "SELECT to_regclass('issue_records') IS NOT NULL").Scan(&retired); err != nil {
		return err
	}
	if retired {
		_, err = provider.Up(ctx)
		return err
	}
	_, err = provider.UpTo(ctx, 17)
	if err != nil {
		return err
	}
	if err = backfillConfiguration(ctx, pool); err != nil {
		return err
	}
	var pending bool
	if err = pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='issues'::regclass AND conname='issues_canonical_required' AND NOT convalidated)").Scan(&pending); err != nil {
		return err
	}
	if pending {
		if _, err = pool.Exec(ctx, "ALTER TABLE issues VALIDATE CONSTRAINT issues_canonical_required"); err != nil {
			return err
		}
	}
	if err = backfillBoards(ctx, pool); err != nil {
		return err
	}
	if err = backfillAssets(ctx, pool); err != nil {
		return err
	}
	if !retire {
		return nil
	}
	_, err = provider.Up(ctx)
	return err
}

// Expansion is committed before these owner-only batches. Old application
// writers participate through the installed bridges, while each batch holds
// the company/project guards before locking rows. An interrupted migration
// safely resumes from remaining NULL references on its next invocation.
func backfillConfiguration(ctx context.Context, pool *pgxpool.Pool) error {
	var available bool
	if err := pool.QueryRow(ctx, "SELECT to_regprocedure('backfill_legacy_issue_configuration(integer)') IS NOT NULL").Scan(&available); err != nil {
		return err
	}
	if !available {
		return nil
	}
	for {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		var affected int
		err = tx.QueryRow(ctx, "SELECT backfill_legacy_issue_configuration(1000)").Scan(&affected)
		if err != nil {
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
			_ = tx.Rollback(cleanup)
			cancel()
			return err
		}
		if err = tx.Commit(ctx); err != nil {
			return err
		}
		if affected == 0 {
			return nil
		}
	}
}

// ApplyThrough builds populated historical fixtures before an expansion. It
// only moves forward; application startup and the CLI use Apply instead.
func ApplyThrough(ctx context.Context, pool *pgxpool.Pool, version int64) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, db, Files)
	if err != nil {
		return err
	}
	_, err = provider.UpTo(ctx, version)
	return err
}

func backfillBoards(ctx context.Context, pool *pgxpool.Pool) error {
	var available bool
	if err := pool.QueryRow(ctx, "SELECT to_regprocedure('backfill_legacy_board_layout(integer)') IS NOT NULL").Scan(&available); err != nil {
		return err
	}
	if !available {
		return nil
	}
	for _, query := range []string{"SELECT backfill_legacy_board_layout(25)", "SELECT backfill_legacy_board_ranks(1000)"} {
		for {
			tx, err := pool.Begin(ctx)
			if err != nil {
				return err
			}
			var affected int
			err = tx.QueryRow(ctx, query).Scan(&affected)
			if err != nil {
				cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
				_ = tx.Rollback(cleanup)
				cancel()
				return err
			}
			if err = tx.Commit(ctx); err != nil {
				return err
			}
			if affected == 0 {
				break
			}
		}
	}
	return nil
}
