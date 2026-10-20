package contracts

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestRESTFixtureValidation(t *testing.T) {
	_, handler := API()
	valid, err := json.Marshal(Example())
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name   string
		body   []byte
		status int
	}{
		{"Unicode and nullable fields", valid, http.StatusOK},
		{"malformed JSON", []byte(`{"id":`), http.StatusBadRequest},
		{"invalid enum", bytes.Replace(valid, []byte(`"review"`), []byte(`"Unknown"`), 1), http.StatusUnprocessableEntity},
		{
			"numeric revision loses precision",
			bytes.Replace(valid, []byte(`"9007199254740993"`), []byte(`9007199254740993`), 1),
			http.StatusUnprocessableEntity,
		},
		{
			"unknown input",
			bytes.Replace(valid, []byte(`"title":`), []byte(`"unexpected":true,"title":`), 1),
			http.StatusUnprocessableEntity,
		},
		{
			"invalid date",
			bytes.Replace(valid, []byte(`"2026-10-12"`), []byte(`"2026-02-30"`), 1),
			http.StatusUnprocessableEntity,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/contract-fixture", bytes.NewReader(test.body))
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			if response.Code != test.status {
				t.Fatalf("status=%d want=%d body=%s", response.Code, test.status, response.Body.String())
			}
			if test.status == http.StatusOK {
				var got Fixture
				if err := json.NewDecoder(response.Body).Decode(&got); err != nil {
					t.Fatal(err)
				}
				if got.Title != Example().Title || got.Revision != Example().Revision || got.AssigneeID != nil {
					t.Fatal("fixture changed Unicode, decimal string or explicit null")
				}
			}
		})
	}
}

func TestMCPFixtureBothResultBranches(t *testing.T) {
	ctx := context.Background()
	server := mcp.NewServer(&mcp.Implementation{Name: "contract-fixture", Version: "0.1.0"}, nil)
	type Input struct {
		Fail bool `json:"fail"`
	}
	// This explicit union is a transport schema; domain outputs remain concrete.
	schema := json.RawMessage(`{"type":"object","oneOf":[{"properties":{"ok":{"const":true},"data":{"type":"object"},"error":{"type":"null"}},"required":["ok","data","error"]},{"properties":{"ok":{"const":false},"data":{"type":"null"},"error":{"type":"object"}},"required":["ok","data","error"]}]}`)
	mcp.AddTool(server, &mcp.Tool{
		Name:         "contract_fixture",
		Description:  "Validate typed serialization",
		OutputSchema: schema,
	},
		func(_ context.Context, _ *mcp.CallToolRequest, in Input) (*mcp.CallToolResult, Result, error) {
			if in.Fail {
				return &mcp.CallToolResult{
					IsError: true,
					Content: []mcp.Content{&mcp.TextContent{Text: "Validation failed"}},
				}, Result{Error: &Failure{
					Code:    "validation",
					Message: "Validation failed",
				}}, nil
			}
			value := Example()
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "Contract fixture returned"}}}, Result{OK: true, Data: &value}, nil
		})
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()
	client := mcp.NewClient(&mcp.Implementation{Name: "typed-contract-client", Version: "0.1.0"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer clientSession.Close()
	for _, fail := range []bool{false, true} {
		result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
			Name:      "contract_fixture",
			Arguments: Input{Fail: fail},
		})
		if err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(result.StructuredContent)
		if err != nil {
			t.Fatal(err)
		}
		var output Result
		decoder := json.NewDecoder(bytes.NewReader(encoded))
		if err := decoder.Decode(&output); err != nil {
			t.Fatal(err)
		}
		if _, err := decoder.Token(); err != io.EOF {
			t.Fatal("unexpected trailing result")
		}
		if output.OK == fail || result.IsError != fail || (output.Data == nil) != fail || (output.Error != nil) != fail {
			t.Fatalf("wrong typed branch: %s", encoded)
		}
	}
}
