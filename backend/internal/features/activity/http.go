package activity

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"reflect"
	"strconv"
)

func RegisterHTTP(api huma.API, service *Service) {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[httpapi.FailureBody](), true, "")}},
		}
	}
	huma.Register(api, huma.Operation{
		OperationID: string(command.ListActivity),
		Method:      "GET",
		Path:        "/api/v1/admin/activity",
		Responses:   responses,
	}, func(ctx context.Context, in *struct {
		Limit        int    `query:"limit" default:"25" minimum:"1" maximum:"100"`
		Cursor       string `query:"cursor" minLength:"1" maxLength:"2048"`
		ResourceKind string `query:"resourceKind" minLength:"1" maxLength:"50"`
		ResourceID   string `query:"resourceId" format:"uuid"`
		ProjectID    string `query:"projectId" format:"uuid"`
		IssueKey     string `query:"issueKey" minLength:"3" maxLength:"32"`
		FromDate     string `query:"fromDate" format:"date"`
		ToDate       string `query:"toDate" format:"date"`
	}) (*struct{ Body command.Page[ActivityView] }, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		input := ListInput{Page: command.PageRequest{Limit: &in.Limit}}
		if in.IssueKey != "" {
			input.IssueKey = &in.IssueKey
		}
		for _, field := range []struct {
			value  string
			target **command.CalendarDate
		}{{in.FromDate, &input.FromDate}, {in.ToDate, &input.ToDate}} {
			if field.value != "" {
				date, parseErr := command.ParseDate(field.value)
				if parseErr != nil {
					return nil, httpapi.Error(&command.Failure{
						Code:        command.Validation,
						Message:     "Enter a valid calendar date.",
						FieldErrors: []command.FieldError{},
						NextAction:  command.ReviewFields,
					})
				}
				*field.target = &date
			}
		}
		if in.Cursor != "" {
			input.Page.Cursor = &in.Cursor
		}
		if in.ResourceKind != "" {
			v := ResourceKind(in.ResourceKind)
			input.ResourceKind = &v
		}
		if in.ResourceID != "" {
			v, err := command.ParseID[ResourceIDKind](in.ResourceID)
			if err != nil {
				return nil, httpapi.Error(&command.Failure{
					Code:        command.Validation,
					Message:     "Enter a valid resource identifier.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.ReviewFields,
				})
			}
			input.ResourceID = &v
		}
		if in.ProjectID != "" {
			v, err := command.ParseID[command.ProjectKind](in.ProjectID)
			if err != nil {
				return nil, httpapi.Error(&command.Failure{
					Code:        command.Validation,
					Message:     "Enter a valid project identifier.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.ReviewFields,
				})
			}
			input.ProjectID = &v
		}
		page, err := service.List(ctx, actor, input)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &struct{ Body command.Page[ActivityView] }{page}, nil
	})
}
