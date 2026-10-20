package attachments

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/attachments/transfer"
	mediavalidation "gategoldjira/backend/internal/features/attachments/validation"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"strings"
	"time"
)

type assetUploadCommand struct {
	IssueID  command.IssueID `json:"issueId"`
	Metadata AssetMetadata   `json:"metadata"`
	ByteSize int32           `json:"byteSize"`
	Checksum string          `json:"checksum"`
}
type assetReservation struct {
	Row      dbgen.UploadReservation
	Receipt  bool
	Transfer bool
}

func normalizeAssetMetadata(in AssetMetadata) (AssetMetadata, error) {
	in.Filename = strings.TrimSpace(in.Filename)
	in.Description = strings.TrimSpace(in.Description)
	if command.ValidateText(in.Filename, 1, 255) != nil || strings.ContainsAny(in.Filename, "/\\\r\n\x00") {
		return in, validation("filename", "Use a filename without path separators or line breaks.")
	}
	if in.Publication != DraftPublication && in.Publication != IssuePublication {
		return in, validation("publication", "Choose draft or issue publication.")
	}
	if in.Kind == ImageAsset {
		if in.MIMEType != "image/png" && in.MIMEType != "image/jpeg" && in.MIMEType != "image/webp" {
			return in, validation("mimeType", "Choose a supported picture type.")
		}
		if in.Description == "" {
			runes := []rune(in.Filename)
			in.Description = string(runes[:min(len(runes), 200)])
		}
	} else if in.Kind == FileAsset {
		if _, err := normalizeMetadata(AttachmentUploadMetadata{Filename: in.Filename, MIMEType: in.MIMEType}); err != nil {
			return in, err
		}
	} else {
		return in, validation("kind", "Choose image or file.")
	}
	if command.ValidateText(in.Description, 0, 200) != nil {
		return in, validation("description", "Use at most 200 characters for the caption.")
	}
	return in, nil
}
func validateAssetContent(metadata AssetMetadata, data []byte) error {
	if metadata.Kind == ImageAsset {
		return mediavalidation.ValidateImage(data, metadata.MIMEType)
	}
	return validateDocument(data, metadata.MIMEType)
}
func (s *Service) reserveAsset(ctx context.Context, actor command.Actor, issue command.IssueID, metadata AssetMetadata, size int64, checksum string, reference uuid.UUID, hash string, operation command.Operation, prefix string) (assetReservation, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, issueScopes(issue, true), func(ctx context.Context, m *command.Mutation) (assetReservation, error) {
		empty := assetReservation{}
		prior, err := m.Queries.AssetsReadRetry(ctx, dbgen.AssetsReadRetryParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: reference,
		})
		if err == nil && (prior.Operation != string(operation) || prior.CanonicalInputHash != hash) {
			return empty, &command.Failure{
				Code:        command.RetryReferenceReused,
				Message:     "This reference belongs to different upload content or an operation.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.UseNewRetryReference,
			}
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return empty, err
		}
		if err == nil {
			return assetReservation{Receipt: true}, nil
		}
		owner, err := m.Queries.AttachmentsResolveIssue(ctx, issue.UUID)
		if err != nil {
			return empty, err
		}
		id := uuid.New()
		staging := prefix + "/" + id.String() + "/staging"
		publication := string(metadata.Publication)
		inserted, err := m.Queries.AssetsReserveSession(ctx, dbgen.AssetsReserveSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: reference,
			Operation:      string(operation),
			CommandHash:    hash,
			AssetID:        id,
			ProjectID:      owner.ProjectID,
			IssueID:        issue.UUID,
			Kind:           string(metadata.Kind),
			StagingKey:     staging,
			ExpectedBytes:  &size,
			MaximumBytes:   10 * 1024 * 1024,
			UploadMethod:   "backend",
			Filename:       &metadata.Filename,
			Description:    &metadata.Description,
			MimeType:       &metadata.MIMEType,
			Publication:    &publication,
			Checksum:       &checksum,
		})
		if err != nil {
			return empty, err
		}
		row, err := m.Queries.AssetsLockSession(ctx, dbgen.AssetsLockSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: reference,
		})
		if err != nil {
			return empty, err
		}
		if row.Operation != string(operation) || row.CommandHash != hash || row.IssueID != issue.UUID || row.Kind != string(metadata.Kind) {
			return empty, &command.Failure{
				Code:        command.RetryReferenceReused,
				Message:     "This reference belongs to different upload content or an operation.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.UseNewRetryReference,
			}
		}
		if row.State == string(UploadCommitted) {
			if _, err = m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{
				ID:       row.AssetID,
				CallerID: actor.UserID.UUID,
			}); err != nil {
				return empty, unavailable()
			}
			return assetReservation{Row: row}, nil
		}
		if row.UploadExpiresAt.Time.Before(time.Now()) || row.State == string(UploadCanceled) || row.State == string(UploadExpired) {
			return empty, validation("retryReference", "This upload expired or was canceled. Start a new upload.")
		}
		if row.ExpectedBytes == nil {
			if err = m.Queries.AssetsFillLegacySession(ctx, dbgen.AssetsFillLegacySessionParams{
				ActorID:        actor.UserID.UUID,
				RetryReference: reference,
				ExpectedBytes:  &size,
				Filename:       &metadata.Filename,
				Description:    &metadata.Description,
				MimeType:       &metadata.MIMEType,
				Publication:    &publication,
			}); err != nil {
				return empty, err
			}
			row.ExpectedBytes = &size
		}
		if *row.ExpectedBytes != size {
			return empty, validation("file", "The file size differs from the reserved content.")
		}
		if inserted == 1 {
			return assetReservation{Row: row, Transfer: true}, nil
		}
		if row.State == string(UploadReady) {
			return assetReservation{Row: row}, nil
		}
		row, err = m.Queries.AssetsClaimSession(ctx, dbgen.AssetsClaimSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: reference,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return empty, busy()
		}
		return assetReservation{Row: row, Transfer: err == nil}, err
	})
}
func (s *Service) failAssetTransfer(ctx context.Context, row dbgen.UploadReservation, info objectstore.Info) {
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
	defer cancel()
	var generation *int64
	if info.Generation > 0 {
		generation = &info.Generation
	}
	_ = dbgen.New(s.runner.Pool).AssetsFailSession(cleanup, dbgen.AssetsFailSessionParams{
		ActorID:           row.ActorID,
		RetryReference:    row.RetryReference,
		ExpectedLease:     row.LeaseUntil,
		StagingGeneration: generation,
	})
}
func (s *Service) UploadAsset(ctx context.Context, actor command.Actor, in AssetUploadInput) (command.SaveOutcome[AssetView], error) {
	metadata, err := normalizeAssetMetadata(in.Metadata)
	if err != nil {
		return command.SaveOutcome[AssetView]{}, err
	}
	checksum := sha256.Sum256(in.Data)
	args := assetUploadCommand{
		IssueID:  in.IssueID,
		Metadata: metadata,
		ByteSize: int32(len(in.Data)),
		Checksum: hex.EncodeToString(checksum[:]),
	}
	return UploadCompatible(ctx, s, actor, in.IssueID, metadata, in.Data, in.RetryReference, command.UploadAsset, args, "attachments", func(v AssetView) AssetView { return v }, validateAssetView)
}

// UploadCompatible retains the original typed request hash and result model for
// older adapters while one reservation/confirmation/finalization owns the bytes.
func UploadCompatible[Input, Output any](ctx context.Context, s *Service, actor command.Actor, issue command.IssueID, metadata AssetMetadata, data []byte, retryReference string, operation command.Operation, args Input, prefix string, mapView func(AssetView) Output, validate func(Output) error) (command.SaveOutcome[Output], error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	empty := command.SaveOutcome[Output]{}
	switch operation {
	case command.UploadPicture:
		if prefix != "pictures" || metadata.Kind != ImageAsset {
			return empty, validation("upload", "Invalid picture adapter.")
		}
	case command.UploadAttachment:
		if prefix != "attachments" || metadata.Kind != FileAsset {
			return empty, validation("upload", "Invalid file adapter.")
		}
	case command.UploadAsset:
		if prefix != "attachments" {
			return empty, validation("upload", "Invalid asset adapter.")
		}
	default:
		return empty, validation("upload", "Unsupported upload operation.")
	}

	if err := validateAssetContent(metadata, data); err != nil {
		return empty, err
	}
	reference, err := uuid.Parse(retryReference)
	if err != nil || reference == uuid.Nil {
		return empty, validation("retryReference", "Use a nonzero UUID retry reference.")
	}
	checksumBytes := sha256.Sum256(data)
	checksum := hex.EncodeToString(checksumBytes[:])
	hash, err := command.CanonicalHash(operation, args)
	if err != nil {
		return empty, busy()
	}
	reserved, err := s.reserveAsset(ctx, actor, issue, metadata, int64(len(data)), checksum, reference, hash, operation, prefix)
	if err != nil {
		return empty, transferFailure(err)
	}
	if reserved.Receipt {
		return command.Save(ctx, s.runner, command.MutationRequest{
			Actor:           actor,
			Operation:       operation,
			RetryReference:  retryReference,
			ResolveProjects: issueScopes(issue, true),
		}, args, func(context.Context, *command.Mutation) error { return nil }, func(context.Context, *command.Mutation, Input) (command.Change[Output], error) {
			return command.Change[Output]{}, busy()
		}, validate)
	}
	row := reserved.Row
	if row.State != string(UploadCommitted) {
		plan := transfer.Plan{
			StagingKey:        objectstore.Key(row.StagingKey),
			StagingGeneration: row.StagingGeneration,
			Content: transfer.Content{
				Size:     int64(len(data)),
				MIMEType: metadata.MIMEType,
				Checksum: checksum,
			},
		}
		if metadata.Publication == IssuePublication {
			key := objectstore.Key(prefix + "/" + row.AssetID.String() + "/published")
			if row.PublishedKey != nil {
				key = objectstore.Key(*row.PublishedKey)
			}
			plan.PublishedKey = &key
			plan.PublishedGeneration = row.PublishedGeneration
		}
		objects, err := transfer.Confirm(ctx, s.store, plan, data)
		if err != nil {
			if reserved.Transfer {
				s.failAssetTransfer(ctx, row, objects.Staging)
			}
			return empty, busy()
		}
		if reserved.Transfer {
			params := dbgen.AssetsReadySessionParams{
				ActorID:           actor.UserID.UUID,
				RetryReference:    reference,
				StagingGeneration: &objects.Staging.Generation,
				Checksum:          &objects.Staging.SHA256,
				ExpectedLease:     row.LeaseUntil,
			}
			if objects.Published != nil {
				key := string(*plan.PublishedKey)
				params.PublishedKey = &key
				params.PublishedGeneration = &objects.Published.Generation
			}
			row, err = command.ReadResolved(ctx, s.runner, actor, command.Access{}, issueScopes(issue, true), func(ctx context.Context, m *command.Mutation) (dbgen.UploadReservation, error) {
				return m.Queries.AssetsReadySession(ctx, params)
			})
			if err != nil {
				s.failAssetTransfer(ctx, reserved.Row, objects.Staging)
				return empty, transferFailure(err)
			}
		}
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       operation,
		RetryReference:  retryReference,
		ResolveProjects: issueScopes(issue, true),
	}
	return command.Save(ctx, s.runner, request, args, func(ctx context.Context, m *command.Mutation) error {
		if _, err := m.Queries.AssetsLockIssue(ctx, issue.UUID); err != nil {
			return err
		}
		current, err := m.Queries.AssetsLockSession(ctx, dbgen.AssetsLockSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: reference,
		})
		if err != nil {
			return err
		}
		if current.CommandHash != hash || (current.State != string(UploadReady) && current.State != string(UploadCommitted)) {
			return busy()
		}
		if current.State == string(UploadCommitted) {
			_, err = m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: current.AssetID, CallerID: actor.UserID.UUID})
		}
		return err
	}, func(ctx context.Context, m *command.Mutation, _ Input) (command.Change[Output], error) {
		empty := command.Change[Output]{}
		current, err := m.Queries.AssetsLockSession(ctx, dbgen.AssetsLockSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: reference,
		})
		if err != nil {
			return empty, err
		}
		if current.State == string(UploadCommitted) {
			visible, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: current.AssetID, CallerID: actor.UserID.UUID})
			return command.Change[Output]{Result: mapView(assetView(visible)), HTTPStatus: 201}, err
		}
		change, err := s.commitUploadedAsset(ctx, m, current, metadata, checksum, operation, issue)
		return command.Change[Output]{
			Result:     mapView(change.Result),
			EventID:    change.EventID,
			HTTPStatus: change.HTTPStatus,
		}, err

	}, validate)
}

func (s *Service) commitUploadedAsset(ctx context.Context, m *command.Mutation, current dbgen.UploadReservation, metadata AssetMetadata, checksum string, operation command.Operation, issue command.IssueID) (command.Change[AssetView], error) {
	var err error
	if current.ExpectedBytes == nil {
		return command.Change[AssetView]{}, busy()
	}
	if current.StagingGeneration == nil || current.Checksum == nil || *current.Checksum != checksum {
		return command.Change[AssetView]{}, busy()
	}
	state := string(PrivateDraft)
	var publishedAt pgtype.Timestamptz
	inPanel := metadata.Publication == IssuePublication
	if inPanel {
		if current.PublishedKey == nil || current.PublishedGeneration == nil {
			return command.Change[AssetView]{}, busy()
		}
		state = string(PublishedAsset)
		publishedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	}
	if _, err = m.Queries.AssetsInsert(ctx, dbgen.AssetsInsertParams{
		ID:                  current.AssetID,
		ProjectID:           current.ProjectID,
		IssueID:             issue.UUID,
		UploadedBy:          m.Actor.UserID.UUID,
		Kind:                string(metadata.Kind),
		Filename:            metadata.Filename,
		Description:         metadata.Description,
		MimeType:            metadata.MIMEType,
		ByteSize:            *current.ExpectedBytes,
		Checksum:            checksum,
		StagingKey:          current.StagingKey,
		StagingGeneration:   *current.StagingGeneration,
		PublishedKey:        current.PublishedKey,
		PublishedGeneration: current.PublishedGeneration,
		State:               state,
		InPanel:             inPanel,
		PublishedAt:         publishedAt,
	}); err != nil {
		return command.Change[AssetView]{}, err
	}
	if inPanel {
		if err = m.Queries.AssetsAdvanceIssue(ctx, issue.UUID); err != nil {
			return command.Change[AssetView]{}, err
		}
	}
	count, err := m.Queries.AssetsCommitSession(ctx, dbgen.AssetsCommitSessionParams{
		ActorID:        m.Actor.UserID.UUID,
		RetryReference: current.RetryReference,
	})
	if err != nil || count != 1 {
		return command.Change[AssetView]{}, busy()
	}
	project := command.ProjectID{UUID: current.ProjectID}
	resource := activity.AttachmentResource
	if metadata.Kind == ImageAsset {
		resource = activity.PictureResource
	}
	visible := string(metadata.Publication)
	changes := []activity.FieldChange{
		{
			Field: "filename",
			After: &metadata.Filename,
		},
		{Field: "publication", After: &visible},
	}
	if operation == command.UploadAttachment {
		attached := "true"
		changes = []activity.FieldChange{
			{Field: "attached", After: &attached},
			{
				Field: "filename",
				After: &metadata.Filename,
			},
		}
	}
	if operation == command.UploadPicture {
		gallery := "false"
		if inPanel {
			gallery = "true"
		}
		changes = []activity.FieldChange{
			{
				Field: "filename",
				After: &metadata.Filename,
			},
			{
				Field: "description",
				After: &metadata.Description,
			},
			{Field: "state", After: &state},
			{Field: "inGallery", After: &gallery},
		}
	}
	event, err := activity.Append(ctx, m, activity.Draft{
		Action:       operation,
		ResourceKind: resource,
		ResourceID:   current.AssetID,
		ProjectID:    &project,
		IssueID:      &issue,
		Changes:      changes,
	})
	if err != nil {
		return command.Change[AssetView]{}, err
	}
	if inPanel {
		if err = notifications.WatchIssueChange(ctx, m, event.ID, issue, "A file was attached to an issue you watch."); err != nil {
			return command.Change[AssetView]{}, err
		}
	}
	result, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: current.AssetID, CallerID: m.Actor.UserID.UUID})
	eventID := event.ID.String()
	return command.Change[AssetView]{Result: assetView(result), EventID: &eventID, HTTPStatus: 201}, err
}
