package command

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math"
	"strings"

	"github.com/google/uuid"
)

const DefaultPageSize = 25
const MaximumPageSize = 100
const MaximumPageBytes = 1024 * 1024
const MaximumCursorBytes = 2048

type PageRequest struct {
	Limit  *int    `json:"limit,omitempty" minimum:"1" maximum:"100"`
	Cursor *string `json:"cursor,omitempty" minLength:"1" maxLength:"2048"`
}

func (request PageRequest) Size() (int, error) {
	if request.Limit == nil {
		return DefaultPageSize, nil
	}
	if *request.Limit < 1 || *request.Limit > MaximumPageSize {
		return 0, pageFailure("The page limit must be between 1 and 100.")
	}
	return *request.Limit, nil
}

type Page[T any] struct {
	Items         []T     `json:"items" nullable:"false" maxItems:"100"`
	NextCursor    *string `json:"nextCursor" nullable:"true" maxLength:"2048"`
	TotalMatching int32   `json:"totalMatching" minimum:"0"`
}
type CursorSigner struct{ secret []byte }

func NewCursorSigner(secret []byte) (*CursorSigner, error) {
	if len(secret) < 32 {
		return nil, errors.New("cursor signing requires at least 32 secret bytes")
	}
	return &CursorSigner{secret: append([]byte(nil), secret...)}, nil
}

type CursorScope struct {
	Operation  Operation `json:"operation"`
	Caller     UserID    `json:"caller"`
	FilterHash string    `json:"filterHash"`
	Sort       string    `json:"sort"`
}

func CursorScopeFor[F any](operation Operation, caller UserID, sort string, normalizedFilters F) (CursorScope, error) {
	if caller.UUID == uuid.Nil || sort == "" || operation.IsMutation() {
		return CursorScope{}, pageFailure("The pagination context is invalid.")
	}
	hash, err := CanonicalHash(operation, normalizedFilters)
	return CursorScope{operation, caller, hash, sort}, err
}

type cursorPayload[K any] struct {
	Version int         `json:"version"`
	Scope   CursorScope `json:"scope"`
	Last    K           `json:"last"`
}

func pageFailure(message string) *Failure { return fail(Validation, message, ReviewFields, false) }
func SignCursor[K any](signer *CursorSigner, scope CursorScope, last K) (string, error) {
	data, err := json.Marshal(cursorPayload[K]{1, scope, last})
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, signer.secret)
	_, _ = mac.Write(data)
	token := base64.RawURLEncoding.EncodeToString(data) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if len(token) > MaximumCursorBytes {
		return "", errors.New("pagination key exceeds cursor budget")
	}
	return token, nil
}

// Cursors carry position only. Each subsequent read still checks current SQL
// account/project/ownership predicates, including its count query.
func ReadCursor[K any](signer *CursorSigner, scope CursorScope, token string) (K, error) {
	var zero K
	invalid := pageFailure("The cursor is invalid for this caller, operation, filters or sort. Start a new search.")
	if len(token) == 0 || len(token) > MaximumCursorBytes {
		return zero, invalid
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return zero, invalid
	}
	data, err := base64.RawURLEncoding.Strict().DecodeString(parts[0])
	if err != nil {
		return zero, invalid
	}
	signature, err := base64.RawURLEncoding.Strict().DecodeString(parts[1])
	if err != nil {
		return zero, invalid
	}
	mac := hmac.New(sha256.New, signer.secret)
	_, _ = mac.Write(data)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return zero, invalid
	}
	var payload cursorPayload[K]
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return zero, invalid
	}
	if _, err := decoder.Token(); err != io.EOF || payload.Version != 1 || payload.Scope != scope {
		return zero, invalid
	}
	return payload.Last, nil
}

// Query at most limit+1 rows in deterministic unique order. Budget truncation
// signs the final emitted key, so it never skips a row inspected but not sent.
func BuildPage[T, K any](signer *CursorSigner, scope CursorScope, candidates []T, limit, total int, more bool, key func(T) K) (Page[T], error) {
	page := Page[T]{Items: []T{}, TotalMatching: int32(total)}
	if limit < 1 || limit > MaximumPageSize || total < 0 || total > math.MaxInt32 || key == nil {
		return page, pageFailure("The pagination arguments are invalid.")
	}
	count := len(candidates)
	if count > limit {
		count = limit
	}
	for i := 0; i < count; i++ {
		page.Items = append(page.Items, candidates[i])
		page.NextCursor = nil
		if more || i+1 < len(candidates) {
			cursor, err := SignCursor(signer, scope, key(candidates[i]))
			if err != nil {
				return page, err
			}
			page.NextCursor = &cursor
		}
		encoded, err := json.Marshal(page)
		if err != nil {
			return page, err
		}
		// Reserve room for transport envelopes; adapters also cap final JSON.
		if len(encoded) > MaximumPageBytes-4096 {
			page.Items = page.Items[:len(page.Items)-1]
			if len(page.Items) == 0 {
				return page, fail(Busy, "This record cannot fit in a bounded page.", None, false)
			}
			cursor, err := SignCursor(signer, scope, key(page.Items[len(page.Items)-1]))
			if err != nil {
				return page, err
			}
			page.NextCursor = &cursor
			return page, nil
		}
	}
	return page, nil
}
