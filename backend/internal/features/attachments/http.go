package attachments

import (
	"context"
	"errors"
	"io"
	"mime"
	"reflect"
	"strconv"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/danielgtaylor/huma/v2"
)

type PageQuery struct {
	Limit  int    `query:"limit" default:"25" minimum:"1" maximum:"100"`
	Cursor string `query:"cursor" minLength:"1" maxLength:"2048"`
}

func (p PageQuery) page() command.PageRequest {
	r := command.PageRequest{Limit: &p.Limit}
	if p.Cursor != "" {
		r.Cursor = &p.Cursor
	}
	return r
}
func operation(api huma.API, name command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[httpapi.FailureBody](), true, "")}},
		}
	}
	op := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
	if name == command.UploadAttachment || name == command.UploadAsset || name == command.FinalizeAssetUpload {
		op.DefaultStatus = 201
		op.MaxBodyBytes = httpapi.MaximumTransportBytes
	}
	return op
}
func registerRead[In, Out any](api huma.API, op huma.Operation, run func(context.Context, command.Actor, *In) (Out, error)) {
	huma.Register(api, op, func(ctx context.Context, in *In) (*struct{ Body Out }, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		out, err := run(ctx, actor, in)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct{ Body Out }{out}, nil
	})
}
func registerSave[In, Out any](api huma.API, op huma.Operation, run func(context.Context, command.Actor, *In) (command.SaveOutcome[Out], error)) {
	huma.Register(api, op, func(ctx context.Context, in *In) (*struct {
		Status int
		Body   command.Saved[Out]
	}, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		out, err := run(ctx, actor, in)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct {
			Status int
			Body   command.Saved[Out]
		}{out.HTTPStatus, out.Body}, nil
	})
}

type multipartUpload struct {
	Metadata AttachmentUploadMetadata `form:"metadata" contentType:"application/json" required:"true"`
	File     huma.FormFile            `form:"file" contentType:"application/octet-stream" required:"true"`
}

func RegisterHTTP(api huma.API, s *Service) {
	RegisterAssetHTTP(api, s)
	registerRead(api, operation(api, command.GetAttachment, "GET", "/attachments/{attachmentId}"), func(ctx context.Context, a command.Actor, in *struct {
		AttachmentID command.AttachmentID `path:"attachmentId"`
	}) (AttachmentView, error) {
		return s.Get(ctx, a, in.AttachmentID)
	})
	registerRead(api, operation(api, command.ListAttachments, "GET", "/issues/{issueId}/attachments"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID command.IssueID `path:"issueId"`
		PageQuery
	}) (command.Page[AttachmentView], error) {
		return s.List(ctx, a, ListInput{in.IssueID, in.page()})
	})
	registerSave(api, operation(api, command.UploadAttachment, "POST", "/issues/{issueId}/attachments"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		RawBody huma.MultipartFormFiles[multipartUpload]
	}) (command.SaveOutcome[AttachmentView], error) {
		empty := command.SaveOutcome[AttachmentView]{}
		form := in.RawBody.Form
		data := in.RawBody.Data()
		if form != nil {
			defer form.RemoveAll()
		}
		if form == nil || data == nil || len(form.Value) != 1 || len(form.Value["metadata"]) != 1 || len(form.File) != 1 || len(form.File["file"]) != 1 {
			return empty, validation("upload", "Supply exactly one metadata field and one file.")
		}
		if data.File.File != nil {
			defer data.File.Close()
		}
		metadata, err := database.DecodeJSON[AttachmentUploadMetadata]([]byte(form.Value["metadata"][0]))
		if err != nil {
			return empty, validation("metadata", "Supply only the declared attachment metadata fields.")
		}
		if err := objectstore.RequireTransfer(ctx); err != nil {
			return empty, busy()
		}
		if data.File.Size < 1 || data.File.Size > objectstore.MaximumSize {
			return empty, &httpapi.StatusError{
				FailureBody: httpapi.Error(validation("file", "Choose an attachment no larger than 10 MiB.")).FailureBody,
				Status:      413,
			}
		}
		bytes, err := io.ReadAll(io.LimitReader(data.File.File, objectstore.MaximumSize+1))
		if err != nil || int64(len(bytes)) != data.File.Size {
			return empty, validation("file", "The complete attachment could not be read.")
		}
		return s.Upload(ctx, a, UploadInput{in.IssueID, metadata, bytes, in.RetryReference})
	})
	registerSave(api, operation(api, command.DetachAttachment, "POST", "/attachments/{attachmentId}/detach"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		AttachmentID command.AttachmentID `path:"attachmentId"`
		Body         AttachmentDetachFields
	}) (command.SaveOutcome[AttachmentView], error) {
		return s.Detach(ctx, a, DetachInput{in.AttachmentID, in.Body.ExpectedIssueRevision, in.RetryReference})
	})
	op := operation(api, command.DownloadAttachment, "GET", "/attachments/{attachmentId}/content")
	op.Responses["200"] = &huma.Response{
		Description: "Private authenticated attachment bytes",
		Content: map[string]*huma.MediaType{
			"application/octet-stream": {Schema: &huma.Schema{Type: "string", Format: "binary"}},
			"application/pdf":          {Schema: &huma.Schema{Type: "string", Format: "binary"}},
			"text/plain":               {Schema: &huma.Schema{Type: "string", Format: "binary"}},
			"text/csv":                 {Schema: &huma.Schema{Type: "string", Format: "binary"}},
			wordMIME:                   {Schema: &huma.Schema{Type: "string", Format: "binary"}},
			sheetMIME:                  {Schema: &huma.Schema{Type: "string", Format: "binary"}},
		},
	}
	huma.Register(api, op, func(ctx context.Context, in *struct {
		AttachmentID command.AttachmentID `path:"attachmentId"`
	}) (*struct{ Body func(huma.Context) }, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		if err := objectstore.RequireTransfer(ctx); err != nil {
			return nil, httpapi.Error(busy())
		}
		out, err := s.Content(ctx, actor, in.AttachmentID)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct{ Body func(huma.Context) }{Body: func(c huma.Context) {
			c.SetHeader("Content-Type", out.Attachment.MIMEType)
			c.SetHeader("Content-Length", strconv.Itoa(len(out.Data)))
			c.SetHeader("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": out.Attachment.Filename}))
			c.SetHeader("Cache-Control", "private, no-store")
			c.SetHeader("X-Content-Type-Options", "nosniff")
			_, _ = c.BodyWriter().Write(out.Data)
		}}, nil
	})
}

func transportError(err error) error {
	var status huma.StatusError
	if errors.As(err, &status) {
		return status
	}
	return httpapi.Error(err)
}
