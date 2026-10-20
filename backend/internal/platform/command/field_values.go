package command

import (
	"encoding/json"
	"errors"
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"regexp"
	"strings"
)

type ValueKind string

const (
	TextValue   ValueKind = "text"
	NumberValue ValueKind = "number"
	DateValue   ValueKind = "date"
	ChoiceValue ValueKind = "choice"
	UserValue   ValueKind = "user"
)

func (k ValueKind) Valid() bool {
	return k == TextValue || k == NumberValue || k == DateValue || k == ChoiceValue || k == UserValue
}

// Decimal uses PostgreSQL numeric(38,10) precision without any float conversion.
// Inputs outside the exact range are rejected rather than rounded by typmod.
type Decimal string

var decimalPattern = regexp.MustCompile(`^-?(0|[1-9][0-9]{0,27})(\.[0-9]{1,10})?$`)

func ParseDecimal(text string) (Decimal, error) {
	if !decimalPattern.MatchString(text) {
		return "", errors.New("use a decimal string with at most 28 integer and 10 fractional digits")
	}
	if strings.Contains(text, ".") {
		text = strings.TrimRight(strings.TrimRight(text, "0"), ".")
	}
	if text == "-0" {
		text = "0"
	}
	return Decimal(text), nil
}
func (d Decimal) MarshalJSON() ([]byte, error) {
	value, err := ParseDecimal(string(d))
	if err != nil {
		return nil, err
	}
	return json.Marshal(string(value))
}
func (d *Decimal) UnmarshalJSON(data []byte) error {
	var text string
	if err := json.Unmarshal(data, &text); err != nil {
		return errors.New("decimal values must be strings")
	}
	value, err := ParseDecimal(text)
	if err == nil {
		*d = value
	}
	return err
}
func (Decimal) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Pattern: decimalPattern.String(), MaxLength: new(40)}
}

type FieldValue struct {
	Kind     ValueKind      `json:"kind" enum:"text,number,date,choice,user"`
	Text     *string        `json:"text,omitempty" maxLength:"5000"`
	Number   *Decimal       `json:"number,omitempty"`
	Date     *CalendarDate  `json:"date,omitempty"`
	OptionID *FieldOptionID `json:"optionId,omitempty"`
	UserID   *UserID        `json:"userId,omitempty"`
}
type FieldAssignment struct {
	FieldID FieldID     `json:"fieldId"`
	Value   *FieldValue `json:"value"`
}

func (v FieldValue) Validate() error {
	slots := 0
	for _, set := range []bool{v.Text != nil, v.Number != nil, v.Date != nil, v.OptionID != nil, v.UserID != nil} {
		if set {
			slots++
		}
	}
	if !v.Kind.Valid() || slots != 1 {
		return errors.New("supply exactly the typed value slot for the field kind")
	}
	switch v.Kind {
	case TextValue:
		if v.Text == nil || ValidateText(*v.Text, 0, 5000) != nil {
			return errors.New("text values contain at most 5,000 characters")
		}
	case NumberValue:
		if v.Number == nil {
			return errors.New("supply number")
		}
		if _, err := ParseDecimal(string(*v.Number)); err != nil {
			return err
		}
	case DateValue:
		if v.Date == nil {
			return errors.New("supply date")
		}
		if _, err := ParseDate(v.Date.String()); err != nil {
			return err
		}
	case ChoiceValue:
		if v.OptionID == nil || v.OptionID.UUID == uuid.Nil {
			return errors.New("supply a nonzero option ID")
		}
	case UserValue:
		if v.UserID == nil || v.UserID.UUID == uuid.Nil {
			return errors.New("supply a nonzero user ID")
		}
	}
	return nil
}

// The transport model is a genuine discriminated union even though Go stores
// five strongly typed optional slots. Both schemas and services enforce the kind.
func (FieldValue) Schema(registry huma.Registry) *huma.Schema {
	maxText := 5000
	alternatives := []*huma.Schema{}
	for _, kind := range []ValueKind{TextValue, NumberValue, DateValue, ChoiceValue, UserValue} {
		name := ""
		var value *huma.Schema
		switch kind {
		case TextValue:
			name = "text"
			value = &huma.Schema{Type: "string", MaxLength: &maxText}
		case NumberValue:
			name = "number"
			value = Decimal("0").Schema(registry)
		case DateValue:
			name = "date"
			value = CalendarDate{}.Schema(registry)
		case ChoiceValue:
			name = "optionId"
			value = FieldOptionID{}.Schema(registry)
		case UserValue:
			name = "userId"
			value = UserID{}.Schema(registry)
		}
		alternatives = append(alternatives, &huma.Schema{
			Type:                 "object",
			AdditionalProperties: false,
			Properties: map[string]*huma.Schema{
				"kind": {Type: "string", Enum: []any{string(kind)}},
				name:   value,
			},
			Required: []string{"kind", name},
		})
	}
	// AdditionalProperties is false, so wrong/mixed slots fail at both transports.
	for _, alternative := range alternatives {
		alternative.AdditionalProperties = false
	}
	return &huma.Schema{Type: "object", OneOf: alternatives}
}

type FieldDefinition struct {
	ID           FieldID     `json:"id"`
	ProjectID    ProjectID   `json:"projectId"`
	Key          string      `json:"key" pattern:"^[a-z][a-z0-9_]{0,31}$"`
	Name         string      `json:"name" minLength:"1" maxLength:"60"`
	Kind         ValueKind   `json:"kind" enum:"text,number,date,choice,user"`
	Required     bool        `json:"required"`
	Retired      bool        `json:"retired"`
	DefaultValue *FieldValue `json:"defaultValue"`
}

func NullableFieldValue(schema *huma.Schema, name string) {
	original := schema.Properties[name]
	original.Nullable = false
	schema.Properties[name] = &huma.Schema{AnyOf: []*huma.Schema{original, {Type: "null"}}}
}
func (FieldAssignment) TransformSchema(_ huma.Registry, schema *huma.Schema) *huma.Schema {
	NullableFieldValue(schema, "value")
	return schema
}
func (FieldDefinition) TransformSchema(_ huma.Registry, schema *huma.Schema) *huma.Schema {
	NullableFieldValue(schema, "defaultValue")
	return schema
}
