package command

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
)

// Inputs are concrete normalized service commands. Transport channel and caller
// are excluded: the ledger key already scopes each reference to one caller.
func CanonicalHash[T any](operation Operation, input T) (string, error) {
	envelope := struct {
		Version   int       `json:"version"`
		Operation Operation `json:"operation"`
		Input     T         `json:"input"`
	}{1, operation, input}
	data, err := json.Marshal(envelope)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:]), nil
}

func decodeReplay[T any](data []byte, validate func(T) error) (T, error) {
	var result T
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&result); err != nil {
		return result, err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return result, errors.New("retry result contains trailing data")
	}
	return result, validate(result)
}
