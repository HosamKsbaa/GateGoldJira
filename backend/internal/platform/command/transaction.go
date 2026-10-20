package command

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WriteGuard joins a feature's cross-command invariant before focused row locks
// and returns the validation to run after the complete owning mutation.
type WriteGuard func(context.Context, *Mutation, Operation, []ProjectScope, *IssueID) (func(context.Context) error, error)
type Runner struct {
	Pool       *pgxpool.Pool
	WriteGuard WriteGuard
}
type ProjectScope struct {
	ProjectID     ProjectID
	Write         bool
	Configure     bool
	AllowArchived bool
	GraphRevision Revision
}
type Access struct {
	CompanyExclusive  bool
	AdministratorOnly bool
	Projects          []ProjectScope
	RepeatableRead    bool
	SharedMetadata    bool
	CapacityIssueID   *IssueID
}
type Mutation struct {
	Tx                 pgx.Tx
	Queries            *dbgen.Queries
	Actor              Actor
	User               dbgen.User
	writableProjects   map[ProjectID]bool
	projectPermissions map[ProjectID]ProjectPermissions
}
type ProjectPermissions struct {
	ProjectKey    string
	ModernCore    bool
	CanWrite      bool
	CanConfigure  bool
	Archived      bool
	GraphRevision Revision
}

func (m *Mutation) ProjectPermissions(project ProjectID) (ProjectPermissions, error) {
	p, ok := m.projectPermissions[project]
	if !ok {
		return ProjectPermissions{}, fail(Unavailable, "The project is unavailable.", None, false)
	}
	return p, nil
}

func (mutation *Mutation) RequireProjectWrite(project ProjectID) error {
	if !mutation.writableProjects[project] {
		return fail(Forbidden, "Current write access and a project lock are required.", None, false)
	}
	return nil
}

type MutationRequest struct {
	Actor          Actor
	Operation      Operation
	RetryReference string
	Access         Access
	// Resolve under the company guard and caller retry lock, before project
	// locks. Account cleanup must not use a racy pre-transaction project list.
	ResolveProjects func(context.Context, *Mutation) ([]ProjectScope, error)
	replayObserved  *bool
}

func fail(code FailureCode, message string, next NextAction, retryable bool) *Failure {
	return &Failure{Code: code, Message: message, FieldErrors: []FieldError{}, NextAction: next, Retryable: retryable}
}
func safeError(err error) error {
	var failure *Failure
	if errors.As(err, &failure) {
		return err
	}
	result := fail(Busy, "The operation could not be confirmed. Retry with the original reference.", RetrySameReference, true)
	result.cause = err
	return result
}

func safeReadError(err error) error {
	safe := safeError(err)
	var failure *Failure
	if errors.As(safe, &failure) && failure.Code == Busy {
		result := fail(Busy, "The view could not be loaded. Reload it to read the current state.", ReloadCurrentState, true)
		result.cause = failure.cause
		return result
	}
	return safe
}

func begin(ctx context.Context, runner Runner, actor Actor, access Access) (*Mutation, error) {
	isolation := pgx.ReadCommitted
	if access.RepeatableRead {
		isolation = pgx.RepeatableRead
	}
	tx, err := runner.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: isolation})
	if err != nil {
		return nil, safeError(err)
	}
	queries := dbgen.New(tx)
	if access.CompanyExclusive {
		_, err = queries.CompanyExclusiveGuard(ctx)
	} else {
		_, err = queries.CompanySharedGuard(ctx)
	}
	if err != nil {
		_ = tx.Rollback(ctx)
		return nil, safeError(err)
	}
	user, err := queries.ReadUser(ctx, actor.UserID.UUID)
	if access.RepeatableRead {
		// A read that waited for account changes must serialize-fail rather
		// than authorize with an older repeatable-read snapshot.
		user, err = queries.ReadCurrentUser(ctx, actor.UserID.UUID)
	}
	if err != nil || !user.ApprovedAt.Valid || user.DisabledAt.Valid {
		_ = tx.Rollback(ctx)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, safeError(err)
		}
		return nil, fail(AccountInactive, "An active approved company account is required.", ContactAdministrator, false)
	}
	if access.AdministratorOnly && !user.IsAdministrator {
		_ = tx.Rollback(ctx)
		return nil, fail(Forbidden, "Administrator access is required.", ContactAdministrator, false)
	}
	return &Mutation{
		Tx:                 tx,
		Queries:            queries,
		Actor:              actor,
		User:               user,
		writableProjects:   make(map[ProjectID]bool),
		projectPermissions: make(map[ProjectID]ProjectPermissions),
	}, nil
}

func lockAndAuthorize(ctx context.Context, mutation *Mutation, access Access, shared bool) error {
	scopes := append([]ProjectScope(nil), access.Projects...)
	sort.Slice(scopes, func(i, j int) bool {
		return bytes.Compare(scopes[i].ProjectID.UUID[:], scopes[j].ProjectID.UUID[:]) < 0
	})
	for _, scope := range scopes {
		var project dbgen.Project
		var err error
		if shared {
			_, err = mutation.Queries.ProjectSharedLifecycle(ctx, scope.ProjectID.UUID)
		} else {
			_, err = mutation.Queries.ProjectExclusiveLifecycle(ctx, scope.ProjectID.UUID)
		}
		if err != nil {
			return safeError(err)
		}
		if shared {
			// Repeatable-read views must still detect a project changed while
			// waiting for its lifecycle guard rather than authorize an old
			// archive/configuration snapshot. Ordinary reads/metadata patches
			// use fresh committed state without the broad project row lock.
			if access.RepeatableRead {
				project, err = mutation.Queries.LockProjectShared(ctx, scope.ProjectID.UUID)
			} else {
				project, err = mutation.Queries.ReadProject(ctx, scope.ProjectID.UUID)
			}
		} else {
			project, err = mutation.Queries.LockProject(ctx, scope.ProjectID.UUID)
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fail(Unavailable, "The project is unavailable.", None, false)
			}
			return safeError(err)
		}
		canWrite := mutation.User.IsAdministrator
		canConfigure := mutation.User.IsAdministrator
		if !mutation.User.IsAdministrator {
			membership, err := mutation.Queries.ReadMembership(ctx, dbgen.ReadMembershipParams{
				ProjectID: project.ID,
				UserID:    mutation.User.ID,
			})
			if access.RepeatableRead {
				membership, err = mutation.Queries.ReadCurrentMembership(ctx, dbgen.ReadCurrentMembershipParams{
					ProjectID: project.ID,
					UserID:    mutation.User.ID,
				})
			}
			if err != nil || membership.RemovedAt.Valid {
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return safeError(err)
				}
				return fail(Unavailable, "The project is unavailable.", None, false)
			}
			if scope.Write && !Role(membership.Role).CanWrite() {
				return fail(Forbidden, "Current project membership permits reading only.", ContactAdministrator, false)
			}
			canWrite = Role(membership.Role).CanWrite()
			canConfigure = Role(membership.Role).CanConfigure()
		}
		if scope.Configure && !canConfigure {
			return fail(Forbidden, "Project administrator access is required.", ContactAdministrator, false)
		}
		if scope.Write && project.ArchivedAt.Valid && (!scope.AllowArchived || !mutation.User.IsAdministrator) {
			return fail(Forbidden, "Archived projects are read-only.", None, false)
		}
		if scope.Write && !shared && !project.ArchivedAt.Valid {
			mutation.writableProjects[scope.ProjectID] = true
		}
		mutation.projectPermissions[scope.ProjectID] = ProjectPermissions{
			ProjectKey:    project.Key,
			ModernCore:    project.CoreMode == "modern",
			CanConfigure:  canConfigure && !project.ArchivedAt.Valid,
			CanWrite:      canWrite && !project.ArchivedAt.Valid,
			Archived:      project.ArchivedAt.Valid,
			GraphRevision: Revision(project.GraphRevision),
		}
	}
	return nil
}

// Execute guarantees one atomic business outcome for a caller/reference. The
// authorize callback runs before replay and checks current resource ownership,
// never expected revisions. Expected-revision checks belong in apply only.
func Execute[Input, Output any](ctx context.Context, runner Runner, request MutationRequest, input Input, authorize func(context.Context, *Mutation) error, apply func(context.Context, *Mutation, Input) (Output, error), validate func(Output) error) (Output, error) {
	ctx, cancel := OrdinaryContext(ctx)
	defer cancel()
	var zero Output
	if authorize == nil || apply == nil || validate == nil {
		return zero, errors.New("mutation requires authorization, application and typed result validation")
	}
	reference, err := uuid.Parse(request.RetryReference)
	if err != nil || reference == uuid.Nil {
		return zero, fail(Validation, "A nonzero UUID retry reference is required.", ReviewFields, false)
	}
	if !request.Operation.IsMutation() {
		return zero, fail(Validation, "The mutation operation is invalid.", ReviewFields, false)
	}
	hash, err := CanonicalHash(request.Operation, input)
	if err != nil {
		return zero, safeError(err)
	}
	mutation, err := begin(ctx, runner, request.Actor, request.Access)
	if err != nil {
		return zero, err
	}
	defer rollback(ctx, mutation.Tx)
	if err := mutation.Queries.ClaimRetryReference(ctx, dbgen.ClaimRetryReferenceParams{
		ActorID:            mutation.User.ID,
		RetryReference:     reference,
		Operation:          string(request.Operation),
		CanonicalInputHash: hash,
	}); err != nil {
		return zero, safeError(err)
	}
	record, err := mutation.Queries.LockRetryRecord(ctx, dbgen.LockRetryRecordParams{
		ActorID:        mutation.User.ID,
		RetryReference: reference,
	})
	if err != nil {
		return zero, safeError(err)
	}
	access := request.Access
	if request.ResolveProjects != nil {
		access.Projects, err = request.ResolveProjects(ctx, mutation)
		if err != nil {
			return zero, safeError(err)
		}
	}
	// Only the independently verified field patch can opt into shared
	// lifecycle protection. Legacy graph/order/configuration writes stay
	// exclusive, and shared metadata never satisfies RequireProjectWrite.
	if access.SharedMetadata && request.Operation != PatchIssueField && request.Operation != PatchModernIssueField && request.Operation != ReorderBoardCard && request.Operation != SaveCustomFields && request.Operation != VoteApproval && request.Operation != ResubmitApproval {
		return zero, fail(Validation, "This operation requires exclusive project protection.", ReviewFields, false)
	}
	if err := lockAndAuthorize(ctx, mutation, access, access.SharedMetadata); err != nil {
		return zero, err
	}
	var checkWrite func(context.Context) error
	if runner.WriteGuard != nil {
		checkWrite, err = runner.WriteGuard(ctx, mutation, request.Operation, access.Projects, access.CapacityIssueID)
		if err != nil {
			return zero, safeError(err)
		}
	}
	if err := authorize(ctx, mutation); err != nil {
		return zero, safeError(err)
	}
	if record.Operation != string(request.Operation) || record.CanonicalInputHash != hash {
		return zero, fail(RetryReferenceReused, "This reference belongs to a different operation or input.", UseNewRetryReference, false)
	}
	if len(record.Result) > 0 {
		if record.ResultVersion != 1 {
			return zero, safeError(errors.New("unsupported replay version"))
		}
		result, err := decodeReplay(record.Result, validate)
		if err != nil {
			return zero, safeError(err)
		}
		if err := mutation.Tx.Commit(ctx); err != nil {
			return zero, safeError(err)
		}
		if request.replayObserved != nil {
			*request.replayObserved = true
		}
		return result, nil
	}
	result, err := apply(ctx, mutation, input)
	if err != nil {
		return zero, safeError(err)
	}
	if checkWrite != nil {
		if err := checkWrite(ctx); err != nil {
			return zero, safeError(err)
		}
	}
	if err := validate(result); err != nil {
		return zero, safeError(err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return zero, safeError(err)
	}
	if len(encoded) > 16*1024*1024 {
		return zero, safeError(errors.New("retry result exceeds transport budget"))
	}
	if err := mutation.Queries.SaveRetryResult(ctx, dbgen.SaveRetryResultParams{
		ActorID:        mutation.User.ID,
		RetryReference: reference,
		Result:         encoded,
	}); err != nil {
		return zero, safeError(err)
	}
	if err := mutation.Tx.Commit(ctx); err != nil {
		return zero, safeError(err)
	}
	return result, nil
}

// AccountChange authorizes and commits credential changes without recording a
// replay payload. One-time secrets must never enter business retry receipts.
// Callers serialize their own account rows and do not automatically retry.
func AccountChange[Output any](ctx context.Context, runner Runner, actor Actor, apply func(context.Context, *Mutation) (Output, error)) (Output, error) {
	ctx, cancel := OrdinaryContext(ctx)
	defer cancel()
	var zero Output
	mutation, err := begin(ctx, runner, actor, Access{})
	if err != nil {
		return zero, err
	}
	defer rollback(ctx, mutation.Tx)
	result, err := apply(ctx, mutation)
	if err != nil {
		return zero, safeError(err)
	}
	if err := mutation.Tx.Commit(ctx); err != nil {
		return zero, safeError(err)
	}
	return result, nil
}

func Read[Output any](ctx context.Context, runner Runner, actor Actor, access Access, query func(context.Context, *Mutation) (Output, error)) (Output, error) {
	return ReadResolved(ctx, runner, actor, access, nil, query)
}

// Resolve resource-to-project relationships only after the current caller is
// checked under the company guard; immutable relationships are then locked.
func ReadResolved[Output any](ctx context.Context, runner Runner, actor Actor, access Access, resolve func(context.Context, *Mutation) ([]ProjectScope, error), query func(context.Context, *Mutation) (Output, error)) (Output, error) {
	ctx, cancel := OrdinaryContext(ctx)
	defer cancel()
	var result Output
	var err error
	// A repeatable read can acquire its snapshot before waiting for an editor's
	// lifecycle lock. Restart only PostgreSQL serialization conflicts, using a
	// fresh transaction and current authorization within the same 5s deadline.
	for range 3 {
		result, err = readResolvedOnce(ctx, runner, actor, access, resolve, query)
		var databaseError *pgconn.PgError
		if !errors.As(err, &databaseError) || databaseError.Code != "40001" {
			return result, err
		}
	}
	return result, err
}
func readResolvedOnce[Output any](ctx context.Context, runner Runner, actor Actor, access Access, resolve func(context.Context, *Mutation) ([]ProjectScope, error), query func(context.Context, *Mutation) (Output, error)) (Output, error) {
	var zero Output
	mutation, err := begin(ctx, runner, actor, access)
	if err != nil {
		return zero, safeReadError(err)
	}
	defer rollback(ctx, mutation.Tx)
	if resolve != nil {
		access.Projects, err = resolve(ctx, mutation)
		if err != nil {
			return zero, safeReadError(err)
		}
	}
	if err := lockAndAuthorize(ctx, mutation, access, true); err != nil {
		return zero, safeReadError(err)
	}
	result, err := query(ctx, mutation)
	if err != nil {
		return zero, safeReadError(err)
	}
	if err := mutation.Tx.Commit(ctx); err != nil {
		return zero, safeReadError(err)
	}
	return result, nil
}

func rollback(ctx context.Context, tx pgx.Tx) {
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
	defer cancel()
	_ = tx.Rollback(cleanup)
}

// Services use this for ordinary work; picture I/O has a separate 30s context
// and never occurs while a Mutation holds a database connection or lock.
func OrdinaryContext(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, 5*time.Second)
}
