package command

import (
	"encoding/json"
	"strings"
	"testing"
)

type pageKey struct {
	Number int    `json:"number"`
	ID     string `json:"id"`
}
type pageItem struct {
	Key  pageKey `json:"key"`
	Text string  `json:"text"`
}

func TestCursorIsBoundToCallerOperationFiltersAndSort(t *testing.T) {
	signer, err := NewCursorSigner([]byte(strings.Repeat("s", 32)))
	if err != nil {
		t.Fatal(err)
	}
	scope, err := CursorScopeFor(ListProjects, NewID[UserKind](), "name,id", struct {
		Archived bool `json:"archived"`
	}{false})
	if err != nil {
		t.Fatal(err)
	}
	key := pageKey{7, "stable-id"}
	token, err := SignCursor(signer, scope, key)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ReadCursor[pageKey](signer, scope, token)
	if err != nil || got != key {
		t.Fatalf("cursor roundtrip: %v %v", got, err)
	}
	for _, changed := range []CursorScope{
		{Operation: GetProject, Caller: scope.Caller, FilterHash: scope.FilterHash, Sort: scope.Sort},
		{Operation: scope.Operation, Caller: NewID[UserKind](), FilterHash: scope.FilterHash, Sort: scope.Sort},
		{Operation: scope.Operation, Caller: scope.Caller, FilterHash: "different", Sort: scope.Sort},
		{Operation: scope.Operation, Caller: scope.Caller, FilterHash: scope.FilterHash, Sort: "id"},
	} {
		if _, err := ReadCursor[pageKey](signer, changed, token); err == nil {
			t.Fatal("cross-scope cursor accepted")
		}
	}
	for _, bad := range []string{token + "x", token[:10], strings.Repeat("x", 2049), "a.b.c"} {
		if _, err := ReadCursor[pageKey](signer, scope, bad); err == nil {
			t.Fatal("bad cursor accepted")
		}
	}
}

func TestPageBudgetContinuesAfterLastReturnedItem(t *testing.T) {
	signer, _ := NewCursorSigner([]byte(strings.Repeat("s", 32)))
	scope, _ := CursorScopeFor(ListProjects, NewID[UserKind](), "number,id", struct{}{})
	items := []pageItem{}
	for i := 1; i <= 4; i++ {
		items = append(items, pageItem{pageKey{i, "id"}, strings.Repeat("ع", 180000)})
	}
	page, err := BuildPage(signer, scope, items, 25, 4, false, func(item pageItem) pageKey { return item.Key })
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.NextCursor == nil {
		t.Fatalf("wrong bounded portion: %d", len(page.Items))
	}
	last, err := ReadCursor[pageKey](signer, scope, *page.NextCursor)
	if err != nil || last.Number != 2 {
		t.Fatalf("skipped records: %v %v", last, err)
	}
	encoded, _ := json.Marshal(page)
	if len(encoded) > MaximumPageBytes {
		t.Fatal("page exceeded byte budget")
	}
	empty, err := BuildPage(signer, scope, []pageItem{}, 25, 0, false, func(item pageItem) pageKey { return item.Key })
	if err != nil || empty.Items == nil || empty.NextCursor != nil {
		t.Fatal("empty page must contain an empty collection")
	}
	if _, err := BuildPage(signer, scope, []pageItem{{
		pageKey{1, "id"},
		strings.Repeat("x", MaximumPageBytes),
	}}, 25, 1, false, func(item pageItem) pageKey { return item.Key }); err == nil {
		t.Fatal("oversize single record accepted")
	}
}

func TestPageLimits(t *testing.T) {
	if got, err := (PageRequest{}).Size(); err != nil || got != 25 {
		t.Fatal("default page size")
	}
	for _, number := range []int{0, -1, 101} {
		if _, err := (PageRequest{Limit: &number}).Size(); err == nil {
			t.Fatal("invalid limit accepted")
		}
	}
}
