package command

import (
	"bytes"
	"encoding/json"
	"github.com/danielgtaylor/huma/v2"
	"reflect"
)

// Nullable represents a required object-or-null field without a nullable $ref,
// which would discard the null branch in downstream JSON Schema generators.
type Nullable[T any] struct{ Value *T }

func (value Nullable[T]) MarshalJSON() ([]byte, error) { return json.Marshal(value.Value) }
func (value *Nullable[T]) UnmarshalJSON(data []byte) error {
	value.Value = nil
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		return nil
	}
	var result T
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&result); err != nil {
		return err
	}
	value.Value = &result
	return nil
}
func (Nullable[T]) Schema(registry huma.Registry) *huma.Schema {
	return &huma.Schema{AnyOf: []*huma.Schema{registry.Schema(reflect.TypeFor[T](), true, ""), {Type: "null"}}}
}
