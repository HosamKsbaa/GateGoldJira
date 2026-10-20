package attachments

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func sessionMetadata(row dbgen.UploadReservation) AssetMetadata {
	value := AssetMetadata{Kind: AssetKind(row.Kind)}
	if row.Filename != nil {
		value.Filename = *row.Filename
	}
	if row.Description != nil {
		value.Description = *row.Description
	}
	if row.MimeType != nil {
		value.MIMEType = *row.MimeType
	}
	if row.Publication != nil {
		value.Publication = PublicationMode(*row.Publication)
	}
	return value
}
func sessionView(row dbgen.UploadReservation) UploadSessionView {
	expected := int64(0)
	if row.ExpectedBytes != nil {
		expected = *row.ExpectedBytes
	}
	return UploadSessionView{
		SessionID:     command.UploadSessionID{UUID: row.RetryReference},
		AssetID:       command.AssetID{UUID: row.AssetID},
		IssueID:       command.IssueID{UUID: row.IssueID},
		State:         UploadState(row.State),
		Metadata:      sessionMetadata(row),
		ExpectedBytes: ByteCount(expected),
		MaximumBytes:  ByteCount(row.MaximumBytes),
		ReceivedBytes: ByteCount(row.ReceivedBytes),
		ChunkBytes:    ByteCount(objectstore.ChunkSize),
		ExpiresAt:     row.UploadExpiresAt.Time.UTC(),
	}
}
func validateSessionView(v UploadSessionView) error {
	if v.SessionID.UUID == uuid.Nil || v.AssetID.UUID == uuid.Nil || v.IssueID.UUID == uuid.Nil || v.ExpectedBytes < 1 || v.ExpectedBytes > v.MaximumBytes || v.MaximumBytes > ByteCount(MaximumAssetBytes) || v.ReceivedBytes > v.ExpectedBytes || v.ExpiresAt.IsZero() {
		return errors.New("invalid upload session")
	}
	return nil
}
func resumeSpec(row dbgen.UploadReservation) objectstore.ResumeSpec {
	return objectstore.ResumeSpec{
		Key:         objectstore.Key(row.StagingKey),
		Size:        *row.ExpectedBytes,
		ContentType: *row.MimeType,
		SHA256:      *row.Checksum,
	}
}
func (s *Service) sessionScopes(id command.UploadSessionID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{
			ActorID:        m.Actor.UserID.UUID,
			RetryReference: id.UUID,
		})
		if err != nil || row.UploadMethod != "resumable" {
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
			return nil, unavailable()
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func (s *Service) GetUpload(ctx context.Context, actor command.Actor, in GetUploadInput) (UploadSessionView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, s.sessionScopes(in.SessionID, false), func(ctx context.Context, m *command.Mutation) (UploadSessionView, error) {
		row, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: in.SessionID.UUID,
		})
		v := sessionView(row)
		if row.UploadExpiresAt.Time.Before(time.Now()) && row.State != string(UploadCommitted) && row.State != string(UploadCanceled) {
			v.State = UploadExpired
		}
		return v, err
	})
}
func assetReceipt[In any](ctx context.Context, s *Service, actor command.Actor, op command.Operation, reference string, args In, resolve func(context.Context, *command.Mutation) ([]command.ProjectScope, error)) (bool, error) {
	ref, err := uuid.Parse(reference)
	if err != nil || ref == uuid.Nil {
		return false, validation("retryReference", "Use a nonzero UUID retry reference.")
	}
	hash, err := command.CanonicalHash(op, args)
	if err != nil {
		return false, busy()
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, resolve, func(ctx context.Context, m *command.Mutation) (bool, error) {
		prior, err := m.Queries.AssetsReadRetry(ctx, dbgen.AssetsReadRetryParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: ref,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if prior.Operation != string(op) || prior.CanonicalInputHash != hash {
			return false, &command.Failure{
				Code:        command.RetryReferenceReused,
				Message:     "This retry reference belongs to different content.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.UseNewRetryReference,
			}
		}
		return true, nil
	})
}
func sessionNoop[In any](ctx context.Context, s *Service, actor command.Actor, op command.Operation, reference string, args In, resolve func(context.Context, *command.Mutation) ([]command.ProjectScope, error), id command.UploadSessionID) (command.SaveOutcome[UploadSessionView], error) {
	return command.Save(ctx, s.runner, command.MutationRequest{
		Actor:           actor,
		Operation:       op,
		RetryReference:  reference,
		ResolveProjects: resolve,
	}, args, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: id.UUID,
		})
		return err
	}, func(ctx context.Context, m *command.Mutation, _ In) (command.Change[UploadSessionView], error) {
		row, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: id.UUID,
		})
		return command.Change[UploadSessionView]{Result: sessionView(row), HTTPStatus: 200}, err
	}, validateSessionView)
}
func (s *Service) StartUpload(ctx context.Context, actor command.Actor, in StartUploadInput) (command.SaveOutcome[UploadSessionView], error) {
	empty := command.SaveOutcome[UploadSessionView]{}
	store, ok := s.store.(objectstore.ResumableStore)
	if !ok {
		return empty, busy()
	}
	metadata, err := normalizeAssetMetadata(in.Metadata)
	if err != nil {
		return empty, err
	}
	in.Metadata = metadata
	maximum := s.maximumBytes
	if metadata.Kind == ImageAsset {
		maximum = min(maximum, objectstore.MaximumSize)
	}
	if in.ExpectedBytes < 1 || int64(in.ExpectedBytes) > maximum {
		return empty, validation("expectedBytes", "The file exceeds the configured upload limit.")
	}
	decoded, err := hex.DecodeString(in.Checksum)
	if err != nil || len(decoded) != sha256.Size || strings.ToLower(in.Checksum) != in.Checksum {
		return empty, validation("checksum", "Supply the complete file's lowercase SHA-256.")
	}
	ref, err := uuid.Parse(in.RetryReference)
	if err != nil || ref == uuid.Nil {
		return empty, validation("retryReference", "Use a nonzero UUID retry reference.")
	}
	id := command.UploadSessionID{UUID: ref}
	resolve := issueScopes(in.IssueID, true)
	prior, err := assetReceipt(ctx, s, actor, command.StartAssetUpload, in.RetryReference, in, resolve)
	if err != nil {
		return empty, err
	}
	if prior {
		return sessionNoop(ctx, s, actor, command.StartAssetUpload, in.RetryReference, in, resolve, id)
	}
	hash, err := command.CanonicalHash(command.StartAssetUpload, in)
	if err != nil {
		return empty, busy()
	}
	row, err := command.ReadResolved(ctx, s.runner, actor, command.Access{}, resolve, func(ctx context.Context, m *command.Mutation) (dbgen.UploadReservation, error) {
		owner, err := m.Queries.AttachmentsResolveIssue(ctx, in.IssueID.UUID)
		if err != nil {
			return dbgen.UploadReservation{}, err
		}
		asset := uuid.New()
		size := int64(in.ExpectedBytes)
		publication := string(metadata.Publication)
		inserted, err := m.Queries.AssetsReserveSession(ctx, dbgen.AssetsReserveSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: ref,
			Operation:      string(command.StartAssetUpload),
			CommandHash:    hash,
			AssetID:        asset,
			ProjectID:      owner.ProjectID,
			IssueID:        in.IssueID.UUID,
			Kind:           string(metadata.Kind),
			StagingKey:     "attachments/" + asset.String() + "/staging",
			ExpectedBytes:  &size,
			MaximumBytes:   maximum,
			UploadMethod:   "resumable",
			Filename:       &metadata.Filename,
			Description:    &metadata.Description,
			MimeType:       &metadata.MIMEType,
			Publication:    &publication,
			Checksum:       &in.Checksum,
		})
		if err != nil {
			return dbgen.UploadReservation{}, err
		}
		current, err := m.Queries.AssetsLockSession(ctx, dbgen.AssetsLockSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: ref,
		})
		if err != nil {
			return current, err
		}
		if current.CommandHash != hash || current.Operation != string(command.StartAssetUpload) {
			return current, &command.Failure{
				Code:        command.RetryReferenceReused,
				Message:     "This reference belongs to another upload.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.UseNewRetryReference,
			}
		}
		if current.State != string(Uploading) || current.UploadExpiresAt.Time.Before(time.Now()) {
			return current, validation("sessionId", "Start a new upload.")
		}
		if current.StorageSession != nil {
			return current, nil
		}
		if inserted == 0 {
			return m.Queries.AssetsClaimSession(ctx, dbgen.AssetsClaimSessionParams{
				ActorID:        actor.UserID.UUID,
				RetryReference: ref,
			})
		}
		return current, nil
	})
	if err != nil {
		return empty, transferFailure(err)
	}
	if row.StorageSession == nil {
		cap, err := store.BeginResume(ctx, resumeSpec(row))
		if err != nil {
			s.releaseAssetLease(ctx, row)
			return empty, busy()
		}
		row, err = command.ReadResolved(ctx, s.runner, actor, command.Access{}, resolve, func(ctx context.Context, m *command.Mutation) (dbgen.UploadReservation, error) {
			return m.Queries.AssetsSetStorageSession(ctx, dbgen.AssetsSetStorageSessionParams{
				ActorID:        actor.UserID.UUID,
				RetryReference: ref,
				StorageSession: &cap,
				ExpectedLease:  row.LeaseUntil,
			})
		})
		if err != nil {
			return empty, transferFailure(err)
		}
	}
	return sessionNoop(ctx, s, actor, command.StartAssetUpload, in.RetryReference, in, resolve, id)
}
func (s *Service) releaseAssetLease(ctx context.Context, row dbgen.UploadReservation) {
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
	defer cancel()
	_ = dbgen.New(s.runner.Pool).AssetsReleaseLease(cleanup, dbgen.AssetsReleaseLeaseParams{
		ActorID:        row.ActorID,
		RetryReference: row.RetryReference,
		ExpectedLease:  row.LeaseUntil,
	})
}
func (s *Service) AppendUpload(ctx context.Context, actor command.Actor, in AppendUploadInput) (command.SaveOutcome[UploadSessionView], error) {
	empty := command.SaveOutcome[UploadSessionView]{}
	store, ok := s.store.(objectstore.ResumableStore)
	if !ok {
		return empty, busy()
	}
	if len(in.DataBase64) > base64.StdEncoding.EncodedLen(int(objectstore.ChunkSize)) || strings.ContainsAny(in.DataBase64, " \r\n\t") {
		return empty, validation("dataBase64", "Use canonical base64, up to 1 MiB per chunk.")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(in.DataBase64)
	if err != nil || len(data) < 1 || base64.StdEncoding.EncodeToString(data) != in.DataBase64 {
		return empty, validation("dataBase64", "Use canonical base64.")
	}
	resolve := s.sessionScopes(in.SessionID, true)
	prior, err := assetReceipt(ctx, s, actor, command.AppendAssetChunk, in.RetryReference, in, resolve)
	if err != nil {
		return empty, err
	}
	if prior {
		return sessionNoop(ctx, s, actor, command.AppendAssetChunk, in.RetryReference, in, resolve, in.SessionID)
	}
	hash := sha256.Sum256(data)
	chunkHash := hex.EncodeToString(hash[:])
	row, err := command.ReadResolved(ctx, s.runner, actor, command.Access{}, resolve, func(ctx context.Context, m *command.Mutation) (dbgen.UploadReservation, error) {
		current, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{ActorID: actor.UserID.UUID, RetryReference: in.SessionID.UUID})
		if err != nil {
			return current, err
		}
		if current.State != string(Uploading) || current.UploadExpiresAt.Time.Before(time.Now()) || current.ExpectedBytes == nil || current.StorageSession == nil {
			return current, validation("sessionId", "This upload is not accepting chunks. Review its current state.")
		}
		if int64(in.Offset) != current.ReceivedBytes {
			return current, validation("offset", "Resume at the upload's current received byte offset.")
		}
		end := int64(in.Offset) + int64(len(data))
		if end > *current.ExpectedBytes || (end < *current.ExpectedBytes && len(data)%(256*1024) != 0) {
			return current, validation("dataBase64", "Use aligned nonfinal chunks within the declared file size.")
		}
		leased, err := m.Queries.AssetsLeaseChunk(ctx, dbgen.AssetsLeaseChunkParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: in.SessionID.UUID,
			ExpectedOffset: int64(in.Offset),
			ChunkHash:      chunkHash,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return current, busy()
		}
		return leased, err
	})
	if err != nil {
		// Another request can commit the same reference after our initial read.
		// Recheck its receipt before treating the advanced offset as invalid.
		replayed, receiptErr := assetReceipt(ctx, s, actor, command.AppendAssetChunk, in.RetryReference, in, resolve)
		if receiptErr != nil {
			return empty, receiptErr
		}
		if replayed {
			return sessionNoop(ctx, s, actor, command.AppendAssetChunk, in.RetryReference, in, resolve, in.SessionID)
		}
		return empty, transferFailure(err)
	}
	defer s.releaseAssetLease(ctx, row)
	n, err := store.AppendResume(ctx, *row.StorageSession, resumeSpec(row), int64(in.Offset), data)
	if err != nil {
		return empty, busy()
	}
	return command.Save(ctx, s.runner, command.MutationRequest{
		Actor:           actor,
		Operation:       command.AppendAssetChunk,
		RetryReference:  in.RetryReference,
		ResolveProjects: resolve,
	}, in, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, _ AppendUploadInput) (command.Change[UploadSessionView], error) {
		current, err := m.Queries.AssetsAcceptChunk(ctx, dbgen.AssetsAcceptChunkParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: in.SessionID.UUID,
			ReceivedBytes:  n,
			ExpectedLease:  row.LeaseUntil,
		})
		return command.Change[UploadSessionView]{Result: sessionView(current), HTTPStatus: 200}, err
	}, validateSessionView)
}
func (s *Service) FinalizeUpload(ctx context.Context, actor command.Actor, in FinalizeUploadInput) (command.SaveOutcome[AssetView], error) {
	empty := command.SaveOutcome[AssetView]{}
	store, ok := s.store.(objectstore.ResumableStore)
	if !ok {
		return empty, busy()
	}
	resolve := s.sessionScopes(in.SessionID, true)
	prior, err := assetReceipt(ctx, s, actor, command.FinalizeAssetUpload, in.RetryReference, in, resolve)
	if err != nil {
		return empty, err
	}
	var row dbgen.UploadReservation
	if !prior {
		row, err = command.ReadResolved(ctx, s.runner, actor, command.Access{}, resolve, func(ctx context.Context, m *command.Mutation) (dbgen.UploadReservation, error) {
			current, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{ActorID: actor.UserID.UUID, RetryReference: in.SessionID.UUID})
			if err != nil {
				return current, err
			}
			if (current.State != string(Uploading) && current.State != string(UploadReady)) || current.UploadExpiresAt.Time.Before(time.Now()) || current.ExpectedBytes == nil || current.StorageSession == nil {
				return current, validation("sessionId", "This upload cannot be finalized. Review its current state.")
			}
			if current.ReceivedBytes != *current.ExpectedBytes {
				return current, validation("sessionId", "Upload every byte before finalizing the file.")
			}
			leased, err := m.Queries.AssetsLeaseFinalize(ctx, dbgen.AssetsLeaseFinalizeParams{
				ActorID:        actor.UserID.UUID,
				RetryReference: in.SessionID.UUID,
			})
			if errors.Is(err, pgx.ErrNoRows) {
				return current, busy()
			}
			return leased, err
		})
		if err != nil {
			replayed, receiptErr := assetReceipt(ctx, s, actor, command.FinalizeAssetUpload, in.RetryReference, in, resolve)
			if receiptErr != nil {
				return empty, receiptErr
			}
			if replayed {
				return s.FinalizeUpload(ctx, actor, in)
			}
			return empty, transferFailure(err)
		}
		defer s.releaseAssetLease(ctx, row)
		info, err := store.FinishResume(ctx, *row.StorageSession, resumeSpec(row))
		if err != nil {
			if errors.Is(err, objectstore.ErrGeneration) {
				return empty, validation("file", "The completed file differs from its declared content. Cancel it and choose the file again.")
			}
			return empty, busy()
		}
		reader, err := s.store.Open(ctx, objectstore.Key(row.StagingKey), info, false)
		if err != nil {
			return empty, busy()
		}
		data, readErr := io.ReadAll(io.LimitReader(reader, row.MaximumBytes+1))
		reader.Close()
		hash := sha256.Sum256(data)
		if readErr != nil || int64(len(data)) != *row.ExpectedBytes || hex.EncodeToString(hash[:]) != *row.Checksum {
			return empty, validation("file", "The completed file does not match its declared size or checksum.")
		}
		metadata := sessionMetadata(row)
		if metadata.Kind == ImageAsset {
			err = validateAssetContent(metadata, data)
		} else {
			err = validateDocumentBounded(data, metadata.MIMEType, row.MaximumBytes)
		}
		if err != nil {
			return empty, err
		}
		var publishedKey *string
		var publishedGeneration *int64
		if metadata.Publication == IssuePublication {
			key := "attachments/" + row.AssetID.String() + "/published"
			existing, inspectErr := s.store.Inspect(ctx, objectstore.Key(key), true)
			if errors.Is(inspectErr, objectstore.ErrNotFound) {
				existing, inspectErr = s.store.Publish(ctx, objectstore.Key(row.StagingKey), info, objectstore.Key(key))
			}
			if inspectErr != nil || existing.Size != info.Size || existing.SHA256 != info.SHA256 {
				return empty, busy()
			}
			publishedKey = &key
			publishedGeneration = &existing.Generation
		}
		if row.State != string(UploadReady) {
			row, err = command.ReadResolved(ctx, s.runner, actor, command.Access{}, resolve, func(ctx context.Context, m *command.Mutation) (dbgen.UploadReservation, error) {
				return m.Queries.AssetsReadySession(ctx, dbgen.AssetsReadySessionParams{
					ActorID:             actor.UserID.UUID,
					RetryReference:      in.SessionID.UUID,
					StagingGeneration:   &info.Generation,
					Checksum:            &info.SHA256,
					PublishedKey:        publishedKey,
					PublishedGeneration: publishedGeneration,
					ExpectedLease:       row.LeaseUntil,
				})
			})
			if err != nil {
				return empty, transferFailure(err)
			}
		}
	}
	return command.Save(ctx, s.runner, command.MutationRequest{
		Actor:           actor,
		Operation:       command.FinalizeAssetUpload,
		RetryReference:  in.RetryReference,
		ResolveProjects: resolve,
	}, in, func(ctx context.Context, m *command.Mutation) error {
		current, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: in.SessionID.UUID,
		})
		if err != nil {
			return err
		}
		if current.State == string(UploadCommitted) {
			_, err = m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: current.AssetID, CallerID: actor.UserID.UUID})
		}
		return err
	}, func(ctx context.Context, m *command.Mutation, _ FinalizeUploadInput) (command.Change[AssetView], error) {
		current, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: in.SessionID.UUID,
		})
		if err != nil {
			return command.Change[AssetView]{}, err
		}
		if _, err = m.Queries.AssetsLockIssue(ctx, current.IssueID); err != nil {
			return command.Change[AssetView]{}, err
		}
		current, err = m.Queries.AssetsLockSession(ctx, dbgen.AssetsLockSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: in.SessionID.UUID,
		})
		if err != nil {
			return command.Change[AssetView]{}, err
		}
		if current.State != string(UploadReady) {
			return command.Change[AssetView]{}, validation("sessionId", "This upload is not ready to publish.")
		}
		return s.commitUploadedAsset(ctx, m, current, sessionMetadata(current), *current.Checksum, command.FinalizeAssetUpload, command.IssueID{UUID: current.IssueID})
	}, validateAssetView)
}
func (s *Service) CancelUpload(ctx context.Context, actor command.Actor, in CancelUploadInput) (command.SaveOutcome[UploadSessionView], error) {
	resolve := s.sessionScopes(in.SessionID, true)
	out, err := command.Save(ctx, s.runner, command.MutationRequest{
		Actor:           actor,
		Operation:       command.CancelAssetUpload,
		RetryReference:  in.RetryReference,
		ResolveProjects: resolve,
	}, in, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, _ CancelUploadInput) (command.Change[UploadSessionView], error) {
		current, err := m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{ActorID: actor.UserID.UUID, RetryReference: in.SessionID.UUID})
		if err != nil {
			return command.Change[UploadSessionView]{}, err
		}
		if current.State == string(UploadCommitted) || current.State == string(UploadExpired) {
			return command.Change[UploadSessionView]{}, validation("sessionId", "A completed or expired upload cannot be canceled.")
		}
		row, err := m.Queries.AssetsCancelSession(ctx, dbgen.AssetsCancelSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: in.SessionID.UUID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return command.Change[UploadSessionView]{}, busy()
		}
		return command.Change[UploadSessionView]{Result: sessionView(row), HTTPStatus: 200}, err
	}, validateSessionView)
	if err != nil {
		return out, err
	}
	row, readErr := command.ReadResolved(ctx, s.runner, actor, command.Access{}, resolve, func(ctx context.Context, m *command.Mutation) (dbgen.UploadReservation, error) {
		return m.Queries.AssetsReadSession(ctx, dbgen.AssetsReadSessionParams{
			ActorID:        actor.UserID.UUID,
			RetryReference: in.SessionID.UUID,
		})
	})
	if readErr == nil && row.StorageSession != nil {
		if store, ok := s.store.(objectstore.ResumableStore); ok {
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
			_ = store.CancelResume(cleanup, *row.StorageSession, resumeSpec(row))
			cancel()
		}
	}
	return out, nil
}
