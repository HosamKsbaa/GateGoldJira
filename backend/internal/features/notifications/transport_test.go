package notifications

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
)

func TestSevenInboxRoutesAndOwnOnlyUnavailableOutcomes(t *testing.T) {
	f := inboxDatabase(t)
	f.produce(t, NewComment)
	ctx := context.Background()
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.service)
	catalog := map[string]bool{}
	for _, path := range api.OpenAPI().Paths {
		for _, op := range []*huma.Operation{path.Get, path.Put, path.Post} {
			if op != nil {
				catalog[op.OperationID] = true
			}
		}
	}
	if len(catalog) != 7 {
		t.Fatal("seven concrete inbox and preference routes required")
	}
	send := func(a command.Actor, method, path, body, ref string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", ref)
		r = r.WithContext(auth.WithActor(r.Context(), a))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	list := send(f.member, "GET", "/notifications?unreadOnly=true&limit=1", "", "")
	var page command.Page[NotificationView]
	if list.Code != 200 || json.Unmarshal(list.Body.Bytes(), &page) != nil || len(page.Items) != 1 || page.TotalMatching != 1 {
		t.Fatal("typed inbox page", list.Code, list.Body.String())
	}
	id := page.Items[0].ID
	unknown := send(f.owner, "GET", "/notifications/"+uuid.NewString(), "", "")
	foreign := send(f.owner, "GET", "/notifications/"+id.String(), "", "")
	if unknown.Code != 404 || foreign.Code != 404 || unknown.Body.String() != foreign.Body.String() {
		t.Fatal("Admin recipient override or existence leak")
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	hidden := send(f.member, "GET", "/notifications/"+id.String(), "", "")
	if hidden.Code != 404 || hidden.Body.String() != unknown.Body.String() {
		t.Fatal("revoked notification distinguishable", hidden.Body.String())
	}
	summary := send(f.member, "GET", "/notifications/summary", "", "")
	var counts InboxSummary
	if summary.Code != 200 || json.Unmarshal(summary.Body.Bytes(), &counts) != nil || counts.UnreadCount != 0 {
		t.Fatal("hidden count", summary.Body.String())
	}
}
