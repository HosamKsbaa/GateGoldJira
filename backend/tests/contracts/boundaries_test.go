package contracts

import (
	"encoding/json"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
)

func TestPublishedTransportSchemasContainLocalDefinitionsAndNulls(t *testing.T) {
	schema, err := mcpapi.Schema[httpapi.FailureBody]()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := schema.Resolve(nil); err != nil {
		t.Fatal("schema requires an external reference", err)
	}
	encoded, err := json.Marshal(httpapi.FailureBody{Error: command.Failure{
		Code:        command.Validation,
		Message:     "Invalid field.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.ReviewFields,
	}})
	if err != nil || !strings.Contains(string(encoded), `"current":null`) || !strings.Contains(string(encoded), `"unfinished":null`) || !strings.Contains(string(encoded), `"fieldErrors":[]`) {
		t.Fatal("failure changed required nullability")
	}
	if command.ValidateText(strings.Repeat("ع", 200), 1, 200) != nil || command.ValidateText(strings.Repeat("ع", 201), 1, 200) == nil {
		t.Fatal("Unicode limit counted bytes")
	}
}
