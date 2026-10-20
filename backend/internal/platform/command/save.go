package command

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

type Receipt struct {
	EventID  *string `json:"eventId" nullable:"true" format:"uuid"`
	Replayed bool    `json:"replayed"`
}
type Saved[T any] struct {
	Result  T       `json:"result"`
	Receipt Receipt `json:"receipt"`
}
type SaveOutcome[T any] struct {
	Body       Saved[T]
	HTTPStatus int
}

// Change is stored in the private retry ledger. HTTP status and event identity
// survive replay; only replay metadata differs in the public Saved result.
type Change[T any] struct {
	Result     T       `json:"result"`
	EventID    *string `json:"eventId"`
	HTTPStatus int     `json:"httpStatus"`
}

func Save[In, Out any](ctx context.Context, runner Runner, request MutationRequest, input In, authorize func(context.Context, *Mutation) error, apply func(context.Context, *Mutation, In) (Change[Out], error), validate func(Out) error) (SaveOutcome[Out], error) {
	replayed := false
	request.replayObserved = &replayed
	change, err := Execute(ctx, runner, request, input, authorize, apply, func(change Change[Out]) error {
		if change.HTTPStatus != 200 && change.HTTPStatus != 201 {
			return errors.New("invalid saved response status")
		}
		if change.EventID != nil {
			if id, err := uuid.Parse(*change.EventID); err != nil || id == uuid.Nil {
				return errors.New("invalid saved event identity")
			}
		}
		return validate(change.Result)
	})
	if err != nil {
		return SaveOutcome[Out]{}, err
	}
	return SaveOutcome[Out]{
		Body: Saved[Out]{
			Result:  change.Result,
			Receipt: Receipt{EventID: change.EventID, Replayed: replayed},
		},
		HTTPStatus: change.HTTPStatus,
	}, nil
}
