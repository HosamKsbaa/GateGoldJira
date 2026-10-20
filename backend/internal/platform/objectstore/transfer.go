package objectstore

import (
	"context"
	"sync"
)

type transferKey struct{}

// A lease follows one HTTP request through decode, I/O and final serialization.
// Lazy acquisition also bounds downloads whose request body is very small.
type TransferLease struct {
	gate    *TransferGate
	mu      sync.Mutex
	release func()
}

func WithTransfer(ctx context.Context, gate *TransferGate) (context.Context, *TransferLease) {
	lease := &TransferLease{gate: gate}
	return context.WithValue(ctx, transferKey{}, lease), lease
}
func (lease *TransferLease) Acquire(ctx context.Context) error {
	lease.mu.Lock()
	defer lease.mu.Unlock()
	if lease.release != nil {
		return ctx.Err()
	}
	release, err := lease.gate.Acquire(ctx)
	if err != nil {
		return err
	}
	lease.release = release
	return nil
}
func (lease *TransferLease) Close() {
	lease.mu.Lock()
	defer lease.mu.Unlock()
	if lease.release != nil {
		lease.release()
		lease.release = nil
	}
}
func RequireTransfer(ctx context.Context) error {
	lease, ok := ctx.Value(transferKey{}).(*TransferLease)
	if !ok {
		return ErrBusy
	}
	return lease.Acquire(ctx)
}
