package command

import (
	"encoding/json"
	"testing"
	"time"
)

func TestRevisionRetainsBigintAndRejectsInvalidWireValues(t *testing.T) {
	for _, invalid := range []string{`42`, `"0"`, `"01"`, `"+1"`, `"9223372036854775808"`, `null`} {
		var revision Revision
		if err := json.Unmarshal([]byte(invalid), &revision); err == nil {
			t.Errorf("accepted %s", invalid)
		}
	}
	var revision Revision
	if err := json.Unmarshal([]byte(`"9007199254740993"`), &revision); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(revision)
	if err != nil || string(encoded) != `"9007199254740993"` {
		t.Fatal("revision lost precision")
	}
}

func TestCompanyDateAndUnicode(t *testing.T) {
	location, err := time.LoadLocation("Africa/Cairo")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 11, 22, 30, 0, 0, time.UTC)
	if Today(now, location).String() != "2026-10-12" {
		t.Fatal("company day ignored Cairo midnight")
	}
	for _, value := range []string{"2026-02-30", "2026-1-01", "2026-10-12T00:00:00Z", "0000-01-01"} {
		if _, err := ParseDate(value); err == nil {
			t.Errorf("accepted %s", value)
		}
	}
	if err := ValidateText("مرحبا", 5, 5); err != nil {
		t.Fatal("Arabic length counted bytes")
	}
	if err := ValidateText(string([]byte{0xff}), 1, 10); err == nil {
		t.Fatal("accepted invalid UTF-8")
	}
	if err := ValidateText("valid\x00text", 1, 20); err == nil {
		t.Fatal("accepted a PostgreSQL-incompatible NUL code point")
	}
	if err := ValidateText("مرحبا\nworld", 1, 20); err != nil {
		t.Fatal("rejected ordinary multiline Unicode", err)
	}
}

func TestIdentifiersRoundTripAndRejectZero(t *testing.T) {
	value := NewID[IssueKind]()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var restored IssueID
	if err := json.Unmarshal(encoded, &restored); err != nil || restored != value {
		t.Fatal("ID roundtrip failed")
	}
	if _, err := ParseID[IssueKind]("00000000-0000-0000-0000-000000000000"); err == nil {
		t.Fatal("zero ID accepted")
	}
}
