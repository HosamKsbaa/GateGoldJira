package command

import (
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

// Slots is the checked persistence shape, kept distinct from the public union.
type FieldSlots struct {
	Text             *string
	Number           *string
	Date             pgtype.Date
	OptionID, UserID *uuid.UUID
}

func (v *FieldValue) Slots() FieldSlots {
	slots := FieldSlots{}
	if v == nil {
		return slots
	}
	slots.Text = v.Text
	if v.Number != nil {
		number := string(*v.Number)
		slots.Number = &number
	}
	if v.Date != nil {
		value, _ := time.Parse("2006-01-02", v.Date.String())
		slots.Date = pgtype.Date{Time: value, Valid: true}
	}
	if v.OptionID != nil {
		id := v.OptionID.UUID
		slots.OptionID = &id
	}
	if v.UserID != nil {
		id := v.UserID.UUID
		slots.UserID = &id
	}
	return slots
}
func ReadFieldSlots(kind ValueKind, slots FieldSlots) (*FieldValue, error) {
	if slots.Text == nil && slots.Number == nil && !slots.Date.Valid && slots.OptionID == nil && slots.UserID == nil {
		return nil, nil
	}
	value := FieldValue{Kind: kind, Text: slots.Text}
	if slots.Number != nil && *slots.Number != "" {
		number, err := ParseDecimal(*slots.Number)
		if err != nil {
			return nil, err
		}
		value.Number = &number
	}
	if slots.Date.Valid {
		date, err := ParseDate(slots.Date.Time.Format("2006-01-02"))
		if err != nil {
			return nil, err
		}
		value.Date = &date
	}
	if slots.OptionID != nil {
		id := FieldOptionID{UUID: *slots.OptionID}
		value.OptionID = &id
	}
	if slots.UserID != nil {
		id := UserID{UUID: *slots.UserID}
		value.UserID = &id
	}
	return &value, value.Validate()
}
func NumberSlot(text string) *string {
	if text == "" {
		return nil
	}
	return &text
}
