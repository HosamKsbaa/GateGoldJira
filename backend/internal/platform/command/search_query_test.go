package command

import (
	"strings"
	"testing"
)

func TestSearchClassificationPreservesNumberAndLiteralContracts(t *testing.T) {
	for _, value := range []string{"2", " 0002 ", "9223372036854775807"} {
		query := ClassifySearch(value)
		if query.Kind != SearchNumber || query.Number == nil || *query.Number < 1 {
			t.Fatalf("positive number %q: %#v", value, query)
		}
	}
	if q := ClassifySearch("0002"); *q.Number != 2 {
		t.Fatal("leading zeros changed exact number")
	}
	for _, value := range []string{"0", "0000", "9223372036854775808", strings.Repeat("9", 200)} {
		if q := ClassifySearch(value); q.Kind != SearchImpossible || q.Number != nil {
			t.Fatalf("invalid numeric match widened: %q %#v", value, q)
		}
	}
	for _, value := range []string{"٢", "Version 2", "بحث", "-2", "2.0"} {
		if q := ClassifySearch(value); q.Kind != SearchLiteral || q.Raw != value {
			t.Fatalf("literal meaning changed: %q %#v", value, q)
		}
	}
	q := ClassifySearch("demo-2")
	if q.Kind != SearchLiteral || q.ProjectKey != "DEMO" || q.KeyNumber == nil || *q.KeyNumber != 2 {
		t.Fatal("complete key classification", q)
	}
	q = ClassifySearch("demo-0002")
	if q.KeyNumber != nil {
		t.Fatal("a noncanonical full key was silently broadened")
	}
	if q := ClassifySearch("  "); q.Kind != SearchEmpty {
		t.Fatal("empty query no longer means all scoped work")
	}
}

func TestSearchEscapesPatternCharactersWithoutChangingLiteralInput(t *testing.T) {
	q := ClassifySearch(`50%_\ done`)
	if q.Raw != `50%_\ done` || q.Pattern != `%50\%\_\\ done%` {
		t.Fatal("LIKE escaping changed literal matching", q)
	}
}
