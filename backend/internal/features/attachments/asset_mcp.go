package attachments

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func assetTool[In, Out any](server *mcp.Server, op command.Operation, binary bool, description string, run func(context.Context, command.Actor, In) (Out, error)) error {
	return mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:      op,
		BinaryTransfer: binary,
		Description:    description,
	}, func(ctx context.Context, in In) (Out, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			var empty Out
			return empty, err
		}
		return run(ctx, a, in)
	})
}
func assetSaveTool[In, Out any](server *mcp.Server, op command.Operation, binary bool, description string, run func(context.Context, command.Actor, In) (command.SaveOutcome[Out], error)) error {
	return assetTool(server, op, binary, description, func(ctx context.Context, a command.Actor, in In) (command.Saved[Out], error) {
		out, err := run(ctx, a, in)
		return out.Body, err
	})
}
func RegisterAssetMCP(server *mcp.Server, s *Service) error {
	registrations := []func() error{
		func() error {
			return assetTool(server, command.GetAssetPolicy, false, "Read the configured file/image and chunk limits.", func(ctx context.Context, a command.Actor, _ struct{}) (AssetPolicy, error) { return s.Policy(ctx, a) })
		},
		func() error {
			return assetTool(server, command.GetAsset, false, "Read currently authorized published or own private asset metadata.", s.GetAsset)
		},
		func() error {
			return assetTool(server, command.ListAssets, false, "List unified issue attachments with scoped cursor pagination.", s.ListAssets)
		},
		func() error {
			return assetSaveTool(server, command.UploadAsset, true, "Upload a validated image or file, up to 10 MiB, as canonical base64. Draft publication remains private until an owning comment is saved.", func(ctx context.Context, a command.Actor, in AssetUploadToolInput) (command.SaveOutcome[AssetView], error) {
				data, err := decodeAttachment(in.DataBase64)
				if err != nil {
					return command.SaveOutcome[AssetView]{}, err
				}
				return s.UploadAsset(ctx, a, AssetUploadInput{in.IssueID, in.Metadata, data, in.RetryReference})
			})
		},
		func() error {
			return assetSaveTool(server, command.DetachAsset, false, "Detach from the issue panel while retaining historical references and bytes.", s.DetachAsset)
		},
		func() error {
			return assetTool(server, command.DownloadAssetChunk, true, "Download at most 1 MiB of private asset bytes with current access checks before and after storage I/O. Do not repeat bytes in prose.", s.DownloadAssetChunk)
		},
		func() error {
			return assetSaveTool(server, command.StartAssetUpload, false, "Reserve a resumable upload with complete SHA-256, byte count and metadata. Session ID is actor scoped; storage capabilities stay private.", s.StartUpload)
		},
		func() error {
			return assetTool(server, command.GetAssetUpload, false, "Read current progress of your own recoverable upload.", s.GetUpload)
		},
		func() error {
			return assetSaveTool(server, command.AppendAssetChunk, true, "Append canonical base64 of at most 1 MiB at the exact received offset. Nonfinal chunks are multiples of 256 KiB. Retry identical content with its original reference.", s.AppendUpload)
		},
		func() error {
			return assetSaveTool(server, command.FinalizeAssetUpload, true, "Verify completed size, SHA-256 and content before committing one private draft or issue attachment.", s.FinalizeUpload)
		},
		func() error {
			return assetSaveTool(server, command.CancelAssetUpload, false, "Cancel your unfinished private upload; published assets cannot be canceled.", s.CancelUpload)
		},
	}
	for _, register := range registrations {
		if err := register(); err != nil {
			return err
		}
	}
	return nil
}
