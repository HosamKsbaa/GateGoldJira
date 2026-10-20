package attachments

import (
	"context"
	"encoding/base64"
	"strings"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func decodeAttachment(value string) ([]byte, error) {
	if len(value) > base64.StdEncoding.EncodedLen(int(objectstore.MaximumSize)) || strings.ContainsAny(value, "\r\n\t ") {
		return nil, validation("upload.dataBase64", "Use canonical bounded base64 without whitespace.")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(value)
	if err != nil || len(data) == 0 || int64(len(data)) > objectstore.MaximumSize || base64.StdEncoding.EncodeToString(data) != value {
		return nil, validation("upload.dataBase64", "Use canonical base64 for an attachment no larger than 10 MiB.")
	}
	return data, nil
}
func RegisterMCP(server *mcp.Server, s *Service) error {
	if err := RegisterAssetMCP(server, s); err != nil {
		return err
	}
	if err := mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.ListAttachments,
		Description: "List currently attached documents with bounded cursor pagination. Detached documents remain downloadable by ID with current project access.",
	}, func(ctx context.Context, in ListInput) (command.Page[AttachmentView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Page[AttachmentView]{}, err
		}
		return s.List(ctx, a, in)
	}); err != nil {
		return err
	}
	if err := mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.GetAttachment,
		Description: "Read protected immutable attachment metadata using current project read access.",
	}, func(ctx context.Context, in GetInput) (AttachmentView, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return AttachmentView{}, err
		}
		return s.Get(ctx, a, in.AttachmentID)
	}); err != nil {
		return err
	}
	if err := mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:      command.UploadAttachment,
		BinaryTransfer: true,
		Description:    "Upload one PDF, UTF-8 TXT/CSV, DOCX or XLSX, maximum decoded 10 MiB, as canonical base64 with filename and matching MIME type. Original retry reference and identical bytes recover ambiguous transfers.",
	}, func(ctx context.Context, in UploadToolInput) (command.Saved[AttachmentView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[AttachmentView]{}, err
		}
		data, err := decodeAttachment(in.Upload.DataBase64)
		if err != nil {
			return command.Saved[AttachmentView]{}, err
		}
		out, err := s.Upload(ctx, a, UploadInput{in.IssueID, in.Upload.AttachmentUploadMetadata, data, in.RetryReference})
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:      command.DownloadAttachment,
		BinaryTransfer: true,
		Description:    "Download one currently authorized attachment as one base64 field plus metadata. No public or signed URL; do not repeat the bytes in prose.",
	}, func(ctx context.Context, in GetInput) (AttachmentDownload, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return AttachmentDownload{}, err
		}
		out, err := s.Content(ctx, a, in.AttachmentID)
		if err != nil {
			return AttachmentDownload{}, err
		}
		return AttachmentDownload{out.Attachment, base64.StdEncoding.EncodeToString(out.Data)}, nil
	}); err != nil {
		return err
	}
	return mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.DetachAttachment,
		Description: "Detach a document using the current issue revision. Immutable bytes and audit history remain available to current authorized project readers.",
	}, func(ctx context.Context, in DetachInput) (command.Saved[AttachmentView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[AttachmentView]{}, err
		}
		out, err := s.Detach(ctx, a, in)
		return out.Body, err
	})
}
