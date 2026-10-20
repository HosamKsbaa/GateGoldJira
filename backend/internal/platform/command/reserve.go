package command

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

// ReserveSave binds a multi-command batch to its original input before any child
// writes. Children use stable independent references and commit bounded outcomes;
// Save later completes this same ledger entry. Concurrent identical batches may
// resume safely, while a reused reference with different input fails before writes.
func ReserveSave[In, Out any](ctx context.Context, runner Runner, request MutationRequest, input In, validate func(Out) error) (*SaveOutcome[Out], error) {
	ctx, cancel := OrdinaryContext(ctx)
	defer cancel()
	reference, err := uuid.Parse(request.RetryReference)
	if err != nil || reference == uuid.Nil || !request.Operation.IsMutation() {
		return nil, fail(Validation, "A valid mutation retry reference is required.", ReviewFields, false)
	}
	hash, err := CanonicalHash(request.Operation, input)
	if err != nil {
		return nil, safeError(err)
	}
	mutation, err := begin(ctx, runner, request.Actor, request.Access)
	if err != nil {
		return nil, err
	}
	defer rollback(ctx, mutation.Tx)
	if err := mutation.Queries.ClaimRetryReference(ctx, dbgen.ClaimRetryReferenceParams{
		ActorID:            mutation.User.ID,
		RetryReference:     reference,
		Operation:          string(request.Operation),
		CanonicalInputHash: hash,
	}); err != nil {
		return nil, safeError(err)
	}
	record, err := mutation.Queries.LockRetryRecord(ctx, dbgen.LockRetryRecordParams{
		ActorID:        mutation.User.ID,
		RetryReference: reference,
	})
	if err != nil {
		return nil, safeError(err)
	}
	if request.ResolveProjects != nil {
		return nil, errors.New("batch reservation requires explicit project scopes")
	}
	if err := lockAndAuthorize(ctx, mutation, request.Access, false); err != nil {
		return nil, err
	}
	if record.Operation != string(request.Operation) || record.CanonicalInputHash != hash {
		return nil, fail(RetryReferenceReused, "This reference belongs to a different operation or input.", UseNewRetryReference, false)
	}
	var outcome *SaveOutcome[Out]
	if len(record.Result) > 0 {
		if record.ResultVersion != 1 {
			return nil, safeError(errors.New("unsupported batch replay version"))
		}
		change, err := decodeReplay[Change[Out]](record.Result, func(v Change[Out]) error {
			if v.EventID != nil {
				if id, err := uuid.Parse(*v.EventID); err != nil || id == uuid.Nil {
					return errors.New("invalid batch event identity")
				}
			}
			if v.HTTPStatus != 200 && v.HTTPStatus != 201 {
				return errors.New("invalid batch status")
			}
			return validate(v.Result)
		})
		if err != nil {
			return nil, safeError(err)
		}
		outcome = &SaveOutcome[Out]{
			HTTPStatus: change.HTTPStatus,
			Body: Saved[Out]{
				Result:  change.Result,
				Receipt: Receipt{EventID: change.EventID, Replayed: true},
			},
		}
	}
	if err := mutation.Tx.Commit(ctx); err != nil {
		return nil, safeError(err)
	}
	return outcome, nil
}
