package mcpapi

import (
	"context"
	"encoding/json"
	"reflect"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type Result[T any] = Envelope[T, httpapi.FailureBody]

type Envelope[T, F any] struct {
	Links []ResourceLink `json:"links,omitempty" nullable:"false" maxItems:"1" doc:"Browser links to the returned resource. Display these links to the user after a successful operation."`
	OK    bool           `json:"ok"`
	Data  *T             `json:"data"`
	Error *F             `json:"error"`
}

func (Envelope[T, F]) TransformSchema(_ huma.Registry, schema *huma.Schema) *huma.Schema {
	for _, name := range []string{"data", "error"} {
		original := schema.Properties[name]
		schema.Properties[name] = &huma.Schema{AnyOf: []*huma.Schema{original, {Type: "null"}}}
	}
	return schema
}

// Huma's DTO tags govern both transports, including enum/length/format rules.
// All references are local definitions, independent of planning documents.
func Schema[T any]() (*jsonschema.Schema, error) {
	registry := huma.NewMapRegistry("#/$defs/", huma.DefaultSchemaNamer)
	root := huma.SchemaFromType(registry, reflect.TypeFor[T]())
	encoded, err := json.Marshal(root)
	if err != nil {
		return nil, err
	}
	var schema jsonschema.Schema
	if err := json.Unmarshal(encoded, &schema); err != nil {
		return nil, err
	}
	schema.Defs = make(map[string]*jsonschema.Schema)
	for name, definition := range registry.Map() {
		encoded, err := json.Marshal(definition)
		if err != nil {
			return nil, err
		}
		var converted jsonschema.Schema
		if err := json.Unmarshal(encoded, &converted); err != nil {
			return nil, err
		}
		schema.Defs[name] = &converted
	}
	return &schema, nil
}
func resultSchema[T, F any]() (*jsonschema.Schema, error) {
	schema, err := Schema[Envelope[T, F]]()
	if err != nil {
		return nil, err
	}
	truth, falsity := any(true), any(false)
	schema.OneOf = []*jsonschema.Schema{
		{Properties: map[string]*jsonschema.Schema{
			"ok":    {Const: &truth},
			"data":  {Not: &jsonschema.Schema{Type: "null"}},
			"error": {Type: "null"},
		}},
		{Properties: map[string]*jsonschema.Schema{
			"ok":    {Const: &falsity},
			"data":  {Type: "null"},
			"error": {Not: &jsonschema.Schema{Type: "null"}},
		}},
	}
	return schema, nil
}

type ToolOptions struct {
	Operation      command.Operation
	Description    string
	Picture        bool
	BinaryTransfer bool
	Destructive    bool
}

func Register[In, Out any](server *mcp.Server, options ToolOptions, run func(context.Context, In) (Out, error)) error {
	return RegisterWithFailure(server, options, run, func(err error) httpapi.FailureBody { return httpapi.Error(err).FailureBody })
}

func RegisterWithFailure[In, Out, F any](server *mcp.Server, options ToolOptions, run func(context.Context, In) (Out, error), mapFailure func(error) F) error {
	input, err := Schema[In]()
	if err != nil {
		return err
	}
	output, err := resultSchema[Out, F]()
	if err != nil {
		return err
	}
	if _, err := output.Resolve(nil); err != nil {
		return err
	}
	resolved, err := input.Resolve(nil)
	if err != nil {
		return err
	}
	// Validate before AddTool's framework validation so invalid arguments also
	// receive the published typed failure branch without raw values in text.
	server.AddReceivingMiddleware(func(next mcp.MethodHandler) mcp.MethodHandler {
		return func(ctx context.Context, method string, request mcp.Request) (mcp.Result, error) {
			if method == "tools/call" {
				params, ok := request.GetParams().(*mcp.CallToolParamsRaw)
				if ok && params.Name == string(options.Operation) {
					return recordActivity(ctx, options.Operation, func(ctx context.Context) (mcp.Result, error) {
						var value any // SDK/JSON boundary only; never passed to a service.
						var decoded In
						arguments := params.Arguments
						if len(arguments) == 0 {
							arguments = json.RawMessage(`{}`)
						}
						// Schema formats do not guarantee that domain decoders accept
						// a value (for example February 30 or a bigint overflow).
						// Decode before the SDK so these failures also stay typed and
						// never expose raw arguments or decoder diagnostics.
						if json.Unmarshal(arguments, &value) != nil || resolved.Validate(value) != nil || json.Unmarshal(arguments, &decoded) != nil {
							failure := &command.Failure{
								Code:        command.Validation,
								Message:     "Tool arguments do not match the declared schema.",
								FieldErrors: []command.FieldError{},
								NextAction:  command.ReviewFields,
							}
							activityFailure(ctx, failure)
							body := mapFailure(failure)
							result := Envelope[Out, F]{Error: &body}
							return &mcp.CallToolResult{
								IsError:           true,
								Content:           []mcp.Content{&mcp.TextContent{Text: failure.Message}},
								StructuredContent: result,
							}, nil
						}
						return next(ctx, method, request)
					})
				}
			}
			return next(ctx, method, request)
		}
	})
	closed := false
	destructive := options.Destructive
	mcp.AddTool(server, &mcp.Tool{Name: string(options.Operation), Description: options.Description, InputSchema: input, OutputSchema: output,
		Annotations: &mcp.ToolAnnotations{
			ReadOnlyHint:    !options.Operation.IsMutation(),
			IdempotentHint:  options.Operation.IsMutation(),
			DestructiveHint: &destructive,
			OpenWorldHint:   &closed,
		}},
		func(ctx context.Context, _ *mcp.CallToolRequest, in In) (*mcp.CallToolResult, Envelope[Out, F], error) {
			if options.Picture || options.BinaryTransfer {
				if err := objectstore.RequireTransfer(ctx); err != nil {
					activityFailure(ctx, err)
					failure := httpapi.Error(err)
					body := mapFailure(err)
					return &mcp.CallToolResult{
						IsError: true,
						Content: []mcp.Content{&mcp.TextContent{Text: failure.Error()}},
					}, Envelope[Out, F]{Error: &body}, nil
				}
			} else {
				var cancel context.CancelFunc
				ctx, cancel = command.OrdinaryContext(ctx)
				defer cancel()
			}
			out, err := run(ctx, in)
			if err != nil {
				activityFailure(ctx, err)
				failure := httpapi.Error(err)
				body := mapFailure(err)
				return &mcp.CallToolResult{
					IsError: true,
					Content: []mcp.Content{&mcp.TextContent{Text: failure.Error()}},
				}, Envelope[Out, F]{Error: &body}, nil
			}
			result := Envelope[Out, F]{OK: true, Data: &out, Links: resultLinks(ctx, out)}
			encoded, err := json.Marshal(result)
			budget := command.MaximumPageBytes - 4096
			if options.Picture || options.BinaryTransfer {
				budget = httpapi.MaximumTransportBytes - 4096
			}
			if err != nil || len(encoded) > budget {
				domainFailure := &command.Failure{
					Code:        command.Busy,
					Message:     "The result exceeds the bounded transport budget.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.None,
				}
				activityFailure(ctx, domainFailure)
				failure := httpapi.Error(domainFailure)
				body := mapFailure(domainFailure)
				return &mcp.CallToolResult{
					IsError: true,
					Content: []mcp.Content{&mcp.TextContent{Text: failure.Error()}},
				}, Envelope[Out, F]{Error: &body}, nil
			}
			activityLinks(ctx, result.Links)
			if options.Picture || options.BinaryTransfer {
				// Keep base64 out of text so large transfers fit the transport budget.
				return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "GateGoldJira operation completed."}}}, result, nil
			}
			// Let the SDK mirror ordinary output into text for clients that only
			// expose content blocks to their model, including Antigravity.
			return &mcp.CallToolResult{}, result, nil
		})
	return nil
}
