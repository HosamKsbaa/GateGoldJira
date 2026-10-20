package httpapi

import (
	"encoding/json"
	"reflect"

	"github.com/danielgtaylor/huma/v2"
)

type TypedStatusError[T any] struct {
	Payload T
	Status  int
	Message string
}

func (failure *TypedStatusError[T]) Error() string  { return failure.Message }
func (failure *TypedStatusError[T]) GetStatus() int { return failure.Status }
func (failure *TypedStatusError[T]) MarshalJSON() ([]byte, error) {
	return json.Marshal(failure.Payload)
}
func (failure TypedStatusError[T]) Schema(registry huma.Registry) *huma.Schema {
	return registry.Schema(reflect.TypeFor[T](), false, "")
}
