package attachments

import (
	"context"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

type AssetMaintenanceResult struct {
	Paused         bool
	ExpiredDrafts  int32
	RemovedStaging int32
	RemovedRetries int64
}

func (s *Service) MaintainAssets(ctx context.Context) (AssetMaintenanceResult, error) {
	result := AssetMaintenanceResult{}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	tx, err := s.runner.Pool.Begin(ctx)
	if err != nil {
		return result, busy()
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	q := dbgen.New(tx)
	paused, err := q.PicturesCleanupPaused(ctx)
	if err != nil {
		return result, busy()
	}
	if paused {
		result.Paused = true
		return result, nil
	}
	count, err := q.AssetsExpireUnreferencedDrafts(ctx)
	if err != nil {
		return result, busy()
	}
	result.ExpiredDrafts = int32(count)
	rows, err := q.AssetsClaimCleanup(ctx)
	if err != nil {
		return result, busy()
	}
	if err = tx.Commit(ctx); err != nil {
		return result, busy()
	}
	// Claims are durable before object I/O. Neither a business connection nor a
	// company/project/resource row lock is held during generation-checked deletion.
	for _, row := range rows {
		if row.StorageSession != nil && row.ExpectedBytes != nil && row.MimeType != nil && row.Checksum != nil {
			if resumable, ok := s.store.(objectstore.ResumableStore); ok {
				cleanup, stop := context.WithTimeout(ctx, 3*time.Second)
				err = resumable.CancelResume(cleanup, *row.StorageSession, resumeSpec(row))
				stop()
				if err != nil {
					continue
				}
			}
		}
		if row.StagingGeneration == nil {
			_, err = dbgen.New(s.runner.Pool).AssetsFinishPartialCleanup(ctx, dbgen.AssetsFinishPartialCleanupParams{
				ActorID:        row.ActorID,
				RetryReference: row.RetryReference,
				ExpectedLease:  pgtype.Timestamptz(row.LeaseUntil),
			})
			if err != nil {
				return result, busy()
			}
			continue
		}
		cleanup, stop := context.WithTimeout(ctx, 3*time.Second)
		err = s.store.DeleteFailedStaging(cleanup, objectstore.Key(row.StagingKey), *row.StagingGeneration)
		stop()
		if err != nil {
			continue
		}
		count, err := dbgen.New(s.runner.Pool).AssetsFinishCleanup(ctx, dbgen.AssetsFinishCleanupParams{
			ActorID:           row.ActorID,
			RetryReference:    row.RetryReference,
			ExpectedLease:     row.LeaseUntil,
			StagingGeneration: row.StagingGeneration,
		})
		if err != nil {
			return result, busy()
		}
		result.RemovedStaging += int32(count)
	}
	result.RemovedRetries, err = dbgen.New(s.runner.Pool).PicturesCleanupRetryRecords(ctx)
	if err != nil {
		return result, busy()
	}
	return result, nil
}
