package database

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"

	"gategoldjira/backend/internal/platform/command"
)

// DecodeJSON isolates persisted JSON at its boundary. Callers supply concrete
// versioned structs and run semantic validation before using the result.
func DecodeJSON[T any](data []byte) (T, error) {
	var result T
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&result); err != nil {
		return result, err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return result, errors.New("persisted JSON contains trailing data")
	}
	return result, nil
}

func DecodeBoardFilters(data []byte, version int32) (command.IssueFilter, error) {
	if version != 1 {
		return command.IssueFilter{}, errors.New("unsupported saved-filter version")
	}
	filter, err := DecodeJSON[command.IssueFilter](data)
	if err != nil {
		return filter, err
	}
	return filter, filter.Validate()
}
