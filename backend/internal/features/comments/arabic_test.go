package comments

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestThirtyArabicMixedLanguageExamplesPreserveOriginalUnicode(t *testing.T) {
	path := os.Getenv("GATEGOLD_ARABIC_FIXTURES")
	if path == "" {
		path = "../../../tests/fixtures/arabic.json"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		HTML string `json:"html"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	if len(fixtures) < 30 {
		t.Fatal("at least30 mixed examples required")
	}
	for i, fixture := range fixtures {
		clean, err := Canonicalize(textBody(fixture.HTML), nil, nil)
		if err != nil || !strings.Contains(clean.PlainText, fixture.Text) {
			t.Fatalf("Unicode fixture%d did not round trip: %v", i, err)
		}
		again, err := Canonicalize(textBody(clean.SafeHTML), nil, nil)
		if err != nil || clean.SafeHTML != again.SafeHTML || clean.PlainText != again.PlainText {
			t.Fatal("canonical Arabic changed on retry")
		}
	}
}
