// Package contracts exercises the serialization pipeline without exposing a
// development probe on the application server.
package contracts

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
)

type Fixture struct {
	ID         string  `json:"id" format:"uuid"`
	Title      string  `json:"title" minLength:"1" maxLength:"200"`
	Status     string  `json:"status" enum:"todo,in_progress,review,done"`
	DueDate    *string `json:"dueDate" nullable:"true" format:"date"`
	AssigneeID *string `json:"assigneeId" nullable:"true" format:"uuid"`
	Revision   string  `json:"revision" pattern:"^[1-9][0-9]*$"`
}

type Failure struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Result struct {
	OK    bool     `json:"ok"`
	Data  *Fixture `json:"data"`
	Error *Failure `json:"error"`
}

func Example() Fixture {
	date := "2026-10-12"
	return Fixture{
		ID:       "c72bdca7-d7a1-45e4-9454-d95013c1a4be",
		Title:    "مراجعة العمل — GateGold",
		Status:   "review",
		DueDate:  &date,
		Revision: "9007199254740993",
	}
}

func API() (huma.API, http.Handler) {
	mux := http.NewServeMux()
	config := huma.DefaultConfig("GateGoldJira contract fixture", "0.1.0")
	config.OpenAPIPath, config.DocsPath, config.SchemasPath = "", "", ""
	api := humago.New(mux, config)
	huma.Register(api, huma.Operation{OperationID: "contract_fixture", Method: http.MethodPost, Path: "/contract-fixture"},
		func(_ context.Context, input *struct{ Body Fixture }) (*struct{ Body Fixture }, error) {
			return &struct{ Body Fixture }{Body: input.Body}, nil
		})
	return api, mux
}
