package pictures

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

func decodePicture(value string) ([]byte, error) {
	if len(value) > base64.StdEncoding.EncodedLen(int(objectstore.MaximumSize)) || strings.ContainsAny(value, "\r\n\t ") {
		return nil, validation("upload.dataBase64", "Use canonical bounded base64 without whitespace.")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(value)
	if err != nil || len(data) == 0 || int64(len(data)) > objectstore.MaximumSize || base64.StdEncoding.EncodeToString(data) != value {
		return nil, validation("upload.dataBase64", "Use canonical base64 for a picture no larger than 10 MiB.")
	}
	return data, nil
}
func RegisterMCP(server *mcp.Server, s *Service) error {
	if err := mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.ListPictures,
		Description: "List current gallery pictures and optionally only your own unexpired private drafts. Inline pictures retained in comments remain downloadable by ID.",
	}, func(ctx context.Context, in ListInput) (command.Page[PictureView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Page[PictureView]{}, err
		}
		return s.List(ctx, a, in)
	}); err != nil {
		return err
	}
	if err := mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.GetPicture,
		Description: "Read protected picture metadata. Unexpired comment drafts are visible only to their uploader with current project access.",
	}, func(ctx context.Context, in GetInput) (PictureView, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return PictureView{}, err
		}
		return s.Get(ctx, a, in.PictureID)
	}); err != nil {
		return err
	}
	if err := mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.UploadPicture,
		Picture:     true,
		Description: "Upload one PNG, JPEG or WebP, maximum decoded 10 MiB, as canonical base64 with filename and meaningful description. Choose a private comment_draft or immediately published gallery picture. Original retry reference and identical bytes recover ambiguous transfers.",
	}, func(ctx context.Context, in UploadToolInput) (command.Saved[PictureView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[PictureView]{}, err
		}
		data, err := decodePicture(in.Upload.DataBase64)
		if err != nil {
			return command.Saved[PictureView]{}, err
		}
		out, err := s.Upload(ctx, a, UploadInput{in.IssueID, in.Upload.UploadMetadata, data, in.RetryReference})
		return out.Body, err
	}); err != nil {
		return err
	}
	if err := mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.DownloadPicture,
		Picture:     true,
		Description: "Download one currently authorized picture as one base64 field plus metadata. No public or signed URL; do not repeat the bytes in prose.",
	}, func(ctx context.Context, in GetInput) (PictureDownload, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return PictureDownload{}, err
		}
		out, err := s.Content(ctx, a, in.PictureID)
		if err != nil {
			return PictureDownload{}, err
		}
		return PictureDownload{out.Picture, base64.StdEncoding.EncodeToString(out.Data)}, nil
	}); err != nil {
		return err
	}
	return mcpapi.Register(server, mcpapi.ToolOptions{
		Operation:   command.DetachGalleryPicture,
		Description: "Remove a published picture from the current gallery using the current issue revision. Immutable bytes and all old comment references remain available to authorized readers.",
	}, func(ctx context.Context, in DetachInput) (command.Saved[PictureView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[PictureView]{}, err
		}
		out, err := s.Detach(ctx, a, in)
		return out.Body, err
	})
}
