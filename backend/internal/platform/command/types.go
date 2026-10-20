// Package command owns typed values shared across transactional feature actions.
package command

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Each marker gives identifiers a distinct compile-time type.
type UserKind struct{}
type ProjectKind struct{}
type IssueKind struct{}
type BoardKind struct{}
type CommentKind struct{}
type PictureKind struct{}
type AttachmentKind struct{}
type AssetKind struct{}
type UploadSessionKind struct{}
type LabelKind struct{}
type EventKind struct{}
type NotificationKind struct{}
type ID[Kind comparable] struct{ UUID uuid.UUID }
type UserID = ID[UserKind]
type ProjectID = ID[ProjectKind]
type IssueID = ID[IssueKind]
type BoardID = ID[BoardKind]
type CommentID = ID[CommentKind]
type PictureID = ID[PictureKind]
type AttachmentID = ID[AttachmentKind]
type AssetID = ID[AssetKind]
type UploadSessionID = ID[UploadSessionKind]
type LabelID = ID[LabelKind]
type EventID = ID[EventKind]
type NotificationID = ID[NotificationKind]

func NewID[K comparable]() ID[K] { return ID[K]{UUID: uuid.New()} }
func ParseID[K comparable](value string) (ID[K], error) {
	id, err := uuid.Parse(value)
	if err != nil || id == uuid.Nil {
		return ID[K]{}, errors.New("identifier must be a nonzero UUID")
	}
	return ID[K]{UUID: id}, nil
}
func (id ID[K]) String() string               { return id.UUID.String() }
func (id ID[K]) MarshalText() ([]byte, error) { return []byte(id.String()), nil }
func (id *ID[K]) UnmarshalText(value []byte) error {
	parsed, err := ParseID[K](string(value))
	if err == nil {
		*id = parsed
	}
	return err
}

// Revision uses a decimal string on the wire to retain all bigint digits.
type Revision int64

func (revision Revision) String() string { return strconv.FormatInt(int64(revision), 10) }
func (revision Revision) MarshalJSON() ([]byte, error) {
	if revision < 1 {
		return nil, errors.New("revision must be positive")
	}
	return json.Marshal(revision.String())
}
func (revision *Revision) UnmarshalJSON(data []byte) error {
	var text string
	if err := json.Unmarshal(data, &text); err != nil {
		return errors.New("revision must be a decimal string")
	}
	if text == "" || text[0] == '0' {
		return errors.New("revision must be a canonical positive decimal")
	}
	for _, digit := range text {
		if digit < '0' || digit > '9' {
			return errors.New("revision must contain decimal digits")
		}
	}
	value, err := strconv.ParseInt(text, 10, 64)
	if err != nil || value < 1 {
		return errors.New("revision exceeds positive bigint range")
	}
	*revision = Revision(value)
	return nil
}

// CalendarDate has no time zone and never shifts at a transport boundary.
type CalendarDate struct{ value time.Time }

func ParseDate(text string) (CalendarDate, error) {
	value, err := time.Parse("2006-01-02", text)
	if err != nil || value.Format("2006-01-02") != text || value.Year() < 1 {
		return CalendarDate{}, errors.New("date must be a valid YYYY-MM-DD calendar date")
	}
	return CalendarDate{value: value}, nil
}
func Today(now time.Time, location *time.Location) CalendarDate {
	local := now.In(location)
	return CalendarDate{value: time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)}
}
func (date CalendarDate) String() string                 { return date.value.Format("2006-01-02") }
func (date CalendarDate) Before(other CalendarDate) bool { return date.value.Before(other.value) }
func (date CalendarDate) MarshalJSON() ([]byte, error) {
	if date.value.IsZero() {
		return nil, errors.New("date is unset")
	}
	return json.Marshal(date.String())
}
func (date *CalendarDate) UnmarshalJSON(data []byte) error {
	var text string
	if err := json.Unmarshal(data, &text); err != nil {
		return errors.New("date must be a string")
	}
	parsed, err := ParseDate(text)
	if err == nil {
		*date = parsed
	}
	return err
}

type Channel string

const (
	REST Channel = "web"
	MCP  Channel = "mcp"
)

type Actor struct {
	UserID  UserID
	Channel Channel
	Today   CalendarDate
	// Set only by personal MCP credential authentication, never by tool arguments.
	MCPTokenID uuid.UUID
}
type ProviderIdentity struct {
	Issuer        string
	Subject       string
	VerifiedEmail *string
}
type FailureCode string

const (
	Unauthenticated      FailureCode = "authentication_required"
	AccountInactive      FailureCode = "account_inactive"
	Forbidden            FailureCode = "forbidden"
	Unavailable          FailureCode = "unavailable_record"
	Validation           FailureCode = "validation_failed"
	Conflict             FailureCode = "conflict"
	Prerequisite         FailureCode = "prerequisite_unfinished"
	RetryReferenceReused FailureCode = "retry_reference_reused"
	Busy                 FailureCode = "temporarily_unavailable"
)

type NextAction string

const (
	SignIn               NextAction = "sign_in"
	ContactAdministrator NextAction = "contact_administrator"
	ReviewFields         NextAction = "review_fields"
	ReloadCurrentState   NextAction = "reload_current_state"
	FinishPrerequisites  NextAction = "finish_prerequisites"
	UseNewRetryReference NextAction = "use_new_retry_reference"
	RetrySameReference   NextAction = "retry_same_reference"
	None                 NextAction = "none"
)

type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}
type Failure struct {
	cause       error
	Code        FailureCode  `json:"code" enum:"authentication_required,account_inactive,forbidden,unavailable_record,validation_failed,conflict,prerequisite_unfinished,retry_reference_reused,temporarily_unavailable"`
	Message     string       `json:"message" minLength:"1" maxLength:"1000"`
	FieldErrors []FieldError `json:"fieldErrors" nullable:"false" maxItems:"100"`
	Retryable   bool         `json:"retryable"`
	NextAction  NextAction   `json:"nextAction" enum:"sign_in,contact_administrator,review_fields,reload_current_state,finish_prerequisites,use_new_retry_reference,retry_same_reference,none"`
}

func (failure *Failure) Error() string { return failure.Message }
func (failure *Failure) Unwrap() error { return failure.cause }

func ValidateText(value string, minimum, maximum int) error {
	if !utf8.ValidString(value) {
		return errors.New("text must be valid UTF-8")
	}
	if strings.ContainsRune(value, '\x00') {
		return errors.New("text must not contain a null character")
	}
	length := utf8.RuneCountInString(value)
	if length < minimum || length > maximum {
		return errors.New("text length is outside the allowed range")
	}
	return nil
}
