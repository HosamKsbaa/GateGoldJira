package database

import "testing"

func TestPersistedFiltersRejectInvalidValues(t *testing.T) {
	for _, value := range []string{
		`{"statuses":["unknown"]}`,
		`{"unknown":true}`,
		`{} {}`,
		`{"dueFrom":"2026-02-30"}`,
		`{"assignee":{"mode":"user"}}`,
	} {
		if _, err := DecodeBoardFilters([]byte(value), 1); err == nil {
			t.Errorf("accepted %s", value)
		}
	}
	if _, err := DecodeBoardFilters([]byte(`{}`), 1); err != nil {
		t.Fatal(err)
	}
	if _, err := DecodeBoardFilters([]byte(`{}`), 2); err == nil {
		t.Fatal("accepted unsupported JSON version")
	}
}
