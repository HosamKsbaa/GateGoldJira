package command

import (
	"encoding/json"
	"errors"

	"github.com/danielgtaylor/huma/v2"
)

func (ID[K]) Schema(huma.Registry) *huma.Schema { return &huma.Schema{Type: "string", Format: "uuid"} }
func (Revision) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Pattern: "^[1-9][0-9]*$"}
}
func (CalendarDate) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Format: "date"}
}
func (Status) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{
		Type:    "string",
		Pattern: "^(todo|in_progress|review|done)(:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$",
	}
}
func (IssueType) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Enum: []any{"task", "bug", "subtask"}}
}
func (Priority) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Enum: []any{"low", "medium", "high"}}
}

// Zero means a membership has never existed. Tombstones retain positive values.
type InitialRevision int64

func (revision InitialRevision) MarshalJSON() ([]byte, error) {
	if revision == 0 {
		return []byte(`"0"`), nil
	}
	return Revision(revision).MarshalJSON()
}
func (revision *InitialRevision) UnmarshalJSON(data []byte) error {
	var text string
	if json.Unmarshal(data, &text) != nil {
		return errors.New("initial revision must be a decimal string")
	}
	if text == "0" {
		*revision = 0
		return nil
	}
	var positive Revision
	if err := positive.UnmarshalJSON(data); err != nil {
		return err
	}
	*revision = InitialRevision(positive)
	return nil
}
func (InitialRevision) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Pattern: "^(0|[1-9][0-9]*)$"}
}
