package command

import (
	"encoding/json"
	"testing"
)

func TestDecimalIsExactAndRejectsRoundingInputs(t *testing.T) {
	for _, input := range []string{
		"9007199254740993.1234567890",
		"9999999999999999999999999999.9999999999",
		"0",
		"-0.0000000001",
	} {
		value, err := ParseDecimal(input)
		if err != nil {
			t.Fatal(input, err)
		}
		data, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		var restored Decimal
		if json.Unmarshal(data, &restored) != nil || restored != value {
			t.Fatal("precision lost", input, string(data))
		}
	}
	for _, input := range []string{
		"1.00000000001",
		"99999999999999999999999999999",
		"NaN",
		"Infinity",
		"1e3",
		"01",
		"+1",
	} {
		if _, err := ParseDecimal(input); err == nil {
			t.Fatal("lossy or noncanonical input", input)
		}
	}
	var value Decimal
	if json.Unmarshal([]byte(`1.25`), &value) == nil {
		t.Fatal("JSON float accepted")
	}
	normalized, err := ParseDecimal("-0.0000")
	if err != nil || normalized != "0" {
		t.Fatal("negative zero normalization")
	}
}
func TestFieldValueRequiresExactlyItsKindSlot(t *testing.T) {
	text := "مرحبا"
	number := Decimal("1.25")
	date, _ := ParseDate("2026-10-14")
	for _, value := range []FieldValue{
		{Kind: TextValue, Text: &text},
		{Kind: NumberValue, Number: &number},
		{Kind: DateValue, Date: &date},
	} {
		if err := value.Validate(); err != nil {
			t.Fatal(err)
		}
	}
	for _, value := range []FieldValue{
		{Kind: TextValue},
		{Kind: NumberValue, Text: &text},
		{
			Kind:   TextValue,
			Text:   &text,
			Number: &number,
		},
		{Kind: "script", Text: &text},
	} {
		if value.Validate() == nil {
			t.Fatal("wrong discriminated slot accepted")
		}
	}
}
