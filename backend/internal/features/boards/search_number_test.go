package boards

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/command"
)

func TestBareIssueNumberBoardSavedAndTemporaryCountsMatchCards(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	byNumber := map[int]command.IssueID{}
	for number := 1; number <= 12; number++ {
		title := "Work item"
		if number == 1 {
			title = "Version 2 عربي"
		}
		if number == 2 {
			title = "Exact target"
		}
		issue := f.issue(t, title, command.Medium)
		if issue.Summary.Number != command.Revision(number) {
			t.Fatal("unexpected fixture issue number", issue.Summary.Number)
		}
		byNumber[number] = issue.Summary.ID
	}
	queryFilter := func(query string) command.IssueFilter {
		if query == "" {
			return command.IssueFilter{}
		}
		return command.IssueFilter{Query: &query}
	}
	for index, entry := range []struct {
		name       string
		saved      string
		temporary  string
		savedCount int32
		visible    int32
		number     int
	}{
		{"saved number", "2", "", 1, 1, 2},
		{"temporary number", "", "2", 12, 1, 2},
		{"trimmed leading zeros", " 0002 ", " 002 ", 1, 1, 2},
		{"different number intersection", "2", "12", 1, 0, 0},
		{"number and title intersection", "2", "Exact", 1, 1, 2},
		{"saved twelve", "12", "", 1, 1, 12},
		{"saved zero", "0000", "", 0, 0, 0},
		{"temporary zero", "", "0", 12, 0, 0},
		{"saved oversized number", strings.Repeat("9", 200), "", 0, 0, 0},
		{"temporary oversized number", "", strings.Repeat("9", 200), 12, 0, 0},
		{"ordinary title with number", "Version 2", "", 1, 1, 1},
		{"saved key prefix with temporary number", "gg", "2", 12, 1, 2},
		{"temporary exact key", "", "gg-2", 12, 1, 2},
	} {
		t.Run(entry.name, func(t *testing.T) {
			board := f.create(t, fmt.Sprintf("Number search %d", index), queryFilter(entry.saved))
			view, err := f.service.Get(ctx, f.member, GetInput{
				BoardID:          board.Board.ID,
				TemporaryFilters: queryFilter(entry.temporary),
			})
			if err != nil {
				t.Fatal("numeric count query failed", err)
			}
			column := view.Columns[0]
			if column.SavedMatchCount != entry.savedCount || column.VisibleMatchCount != entry.visible {
				t.Fatal("saved/temporary numeric counts", column.SavedMatchCount, column.VisibleMatchCount)
			}
			for _, other := range view.Columns[1:] {
				if other.SavedMatchCount != 0 || other.VisibleMatchCount != 0 {
					t.Fatal("numeric count escaped source stage")
				}
			}
			limit := 1
			cards, err := f.service.Cards(ctx, f.member, CardsInput{
				BoardID:          board.Board.ID,
				Status:           column.Status,
				TemporaryFilters: queryFilter(entry.temporary),
				Page:             command.PageRequest{Limit: &limit},
			})
			if err != nil || cards.Column.SavedMatchCount != column.SavedMatchCount || cards.Column.VisibleMatchCount != column.VisibleMatchCount || len(cards.Items) != int(entry.visible) || cards.NextCursor != nil {
				t.Fatal("numeric card page disagrees with board count", err, len(cards.Items), cards.Column)
			}
			for _, item := range cards.Items {
				if item.ID != byNumber[entry.number] {
					t.Fatal("numeric card page returned title/prefix match", item.Key)
				}
			}
		})
	}
}
