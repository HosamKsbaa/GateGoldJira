package attachments

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/danielgtaylor/huma/v2"
	"strconv"
)

type AssetUploadFields struct {
	Metadata   AssetMetadata `json:"metadata"`
	DataBase64 string        `json:"dataBase64" minLength:"4" maxLength:"13981016" contentEncoding:"base64"`
}
type AssetDetachFields struct {
	ExpectedIssueRevision command.Revision `json:"expectedIssueRevision"`
}
type AssetPolicy struct {
	MaximumFileBytes  ByteCount `json:"maximumFileBytes"`
	MaximumImageBytes ByteCount `json:"maximumImageBytes"`
	ChunkBytes        ByteCount `json:"chunkBytes"`
}

func (s *Service) Policy(ctx context.Context, a command.Actor) (AssetPolicy, error) {
	return command.Read(ctx, s.runner, a, command.Access{}, func(context.Context, *command.Mutation) (AssetPolicy, error) {
		return AssetPolicy{
			ByteCount(s.maximumBytes),
			ByteCount(min(s.maximumBytes, objectstore.MaximumSize)),
			ByteCount(objectstore.ChunkSize),
		}, nil
	})
}
func RegisterAssetHTTP(api huma.API, s *Service) {
	registerRead(api, operation(api, command.GetAssetPolicy, "GET", "/asset-policy"), func(ctx context.Context, a command.Actor, _ *struct{}) (AssetPolicy, error) { return s.Policy(ctx, a) })
	registerRead(api, operation(api, command.GetAsset, "GET", "/assets/{assetId}"), func(ctx context.Context, a command.Actor, in *struct {
		AssetID command.AssetID `path:"assetId"`
	}) (AssetView, error) {
		return s.GetAsset(ctx, a, AssetGetInput{in.AssetID})
	})
	registerRead(api, operation(api, command.ListAssets, "GET", "/issues/{issueId}/assets"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID          command.IssueID `path:"issueId"`
		IncludeOwnDrafts bool            `query:"includeOwnDrafts"`
		PageQuery
	}) (command.Page[AssetView], error) {
		return s.ListAssets(ctx, a, AssetListInput{in.IssueID, in.IncludeOwnDrafts, in.page()})
	})
	op := operation(api, command.UploadAsset, "POST", "/issues/{issueId}/assets")
	op.MaxBodyBytes = httpapi.MaximumTransportBytes
	registerSave(api, op, func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    AssetUploadFields
	}) (command.SaveOutcome[AssetView], error) {
		if err := objectstore.RequireTransfer(ctx); err != nil {
			return command.SaveOutcome[AssetView]{}, busy()
		}
		data, err := decodeAttachment(in.Body.DataBase64)
		if err != nil {
			return command.SaveOutcome[AssetView]{}, err
		}
		return s.UploadAsset(ctx, a, AssetUploadInput{in.IssueID, in.Body.Metadata, data, in.RetryReference})
	})
	registerSave(api, operation(api, command.DetachAsset, "POST", "/assets/{assetId}/detach"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		AssetID command.AssetID `path:"assetId"`
		Body    AssetDetachFields
	}) (command.SaveOutcome[AssetView], error) {
		return s.DetachAsset(ctx, a, AssetDetachInput{in.AssetID, in.Body.ExpectedIssueRevision, in.RetryReference})
	})
	registerRead(api, operation(api, command.DownloadAssetChunk, "GET", "/assets/{assetId}/chunk"), func(ctx context.Context, a command.Actor, in *struct {
		AssetID command.AssetID `path:"assetId"`
		Offset  ByteQuery       `query:"offset" default:"0"`
		Count   ByteQuery       `query:"count" default:"1048576"`
	}) (AssetChunk, error) {
		if err := objectstore.RequireTransfer(ctx); err != nil {
			return AssetChunk{}, busy()
		}
		offset, err := in.Offset.count()
		if err != nil {
			return AssetChunk{}, err
		}
		count, err := in.Count.count()
		if err != nil {
			return AssetChunk{}, err
		}
		return s.DownloadAssetChunk(ctx, a, AssetDownloadInput{in.AssetID, offset, count})
	})
	registerSave(api, operation(api, command.StartAssetUpload, "POST", "/issues/{issueId}/asset-uploads"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    StartUploadFields
	}) (command.SaveOutcome[UploadSessionView], error) {
		return s.StartUpload(ctx, a, StartUploadInput{in.IssueID, in.Body, in.RetryReference})
	})
	registerRead(api, operation(api, command.GetAssetUpload, "GET", "/asset-uploads/{sessionId}"), func(ctx context.Context, a command.Actor, in *struct {
		SessionID command.UploadSessionID `path:"sessionId"`
	}) (UploadSessionView, error) {
		return s.GetUpload(ctx, a, GetUploadInput{in.SessionID})
	})
	op = operation(api, command.AppendAssetChunk, "POST", "/asset-uploads/{sessionId}/chunks")
	op.MaxBodyBytes = 2 * 1024 * 1024
	registerSave(api, op, func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		SessionID command.UploadSessionID `path:"sessionId"`
		Body      AppendUploadFields
	}) (command.SaveOutcome[UploadSessionView], error) {
		if err := objectstore.RequireTransfer(ctx); err != nil {
			return command.SaveOutcome[UploadSessionView]{}, busy()
		}
		return s.AppendUpload(ctx, a, AppendUploadInput{in.SessionID, in.Body, in.RetryReference})
	})
	registerSave(api, operation(api, command.FinalizeAssetUpload, "POST", "/asset-uploads/{sessionId}/finalize"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		SessionID command.UploadSessionID `path:"sessionId"`
	}) (command.SaveOutcome[AssetView], error) {
		if err := objectstore.RequireTransfer(ctx); err != nil {
			return command.SaveOutcome[AssetView]{}, busy()
		}
		return s.FinalizeUpload(ctx, a, FinalizeUploadInput{in.SessionID, in.RetryReference})
	})
	registerSave(api, operation(api, command.CancelAssetUpload, "POST", "/asset-uploads/{sessionId}/cancel"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		SessionID command.UploadSessionID `path:"sessionId"`
	}) (command.SaveOutcome[UploadSessionView], error) {
		return s.CancelUpload(ctx, a, CancelUploadInput{in.SessionID, in.RetryReference})
	})
}

type ByteQuery string

func (ByteQuery) Schema(r huma.Registry) *huma.Schema { return ByteCount(0).Schema(r) }
func (value ByteQuery) count() (ByteCount, error) {
	n, err := strconv.ParseInt(string(value), 10, 64)
	if err != nil || n < 0 || n > MaximumAssetBytes {
		return 0, validation("offset", "Use a bounded decimal byte count.")
	}
	return ByteCount(n), nil
}
