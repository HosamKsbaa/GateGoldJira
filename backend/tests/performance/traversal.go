package performance

import (
	"encoding/json"
	"net/url"
	"testing"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
)

func verifyPages[T any](t *testing.T, name string, wanted int, read func(*string) []byte, key func(T) string) {
	t.Helper()
	seen := map[string]bool{}
	var cursor *string
	for pages := 0; pages <= wanted; pages++ {
		var p command.Page[T]
		if err := json.Unmarshal(read(cursor), &p); err != nil {
			t.Fatal(name, err)
		}
		if len(p.Items) > 100 || p.TotalMatching != int32(wanted) {
			t.Fatal("page bound/count", name)
		}
		for _, item := range p.Items {
			id := key(item)
			if id == "" || seen[id] {
				t.Fatal("pagination duplicated", name)
			}
			seen[id] = true
		}
		if p.NextCursor == nil {
			if len(seen) != wanted {
				t.Fatal("pagination omitted", name, len(seen), wanted)
			}
			t.Logf("Traversed %s: %d unique matches once", name, wanted)
			return
		}
		cursor = p.NextCursor
	}
	t.Fatal("pagination did not terminate", name)
}
func traverse(t *testing.T, f ScaleFixture, tokens []string, request func(string, string, string, string, []byte, string) []byte) {
	t.Helper()
	query := func(path string, cursor *string) string {
		result := path + "?limit=100"
		if cursor != nil {
			result += "&cursor=" + url.QueryEscape(*cursor)
		}
		return result
	}
	verifyPages(t, "all10kissues", 10000, func(cursor *string) []byte {
		limit := 100
		data, err := json.Marshal(issues.SearchInput{
			Filters: command.IssueFilter{},
			Page:    command.PageRequest{Limit: &limit, Cursor: cursor},
		})
		if err != nil {
			t.Fatal(err)
		}
		return request("POST", "/issues/search", tokens[1], "", data, "application/json")
	}, func(v issues.IssueSummary) string { return v.ID.String() })
	verifyPages(t, "50000personalnotifications", 50000, func(cursor *string) []byte {
		return request("GET", query("/notifications", cursor), tokens[1], "", nil, "")
	}, func(v notifications.NotificationView) string { return v.ID.String() })
	verifyPages(t, "50000activityevents", 50000, func(cursor *string) []byte {
		return request("GET", query("/admin/activity", cursor), tokens[0], "", nil, "")
	}, func(v activity.ActivityView) string { return v.ID.String() })
	verifyPages(t, "500comments", 500, func(cursor *string) []byte {
		return request("GET", query("/issues/"+f.Issues[0].ID.String()+"/comments", cursor), tokens[1], "", nil, "")
	}, func(v comments.CommentView) string { return v.ID.String() })
}
