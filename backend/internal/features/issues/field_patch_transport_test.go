package issues

import (
	"encoding/json"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/google/uuid"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFieldPatchRESTRequiresPriorAndKeepsUnrelatedContent(t *testing.T) {
	f := issueDatabase(t)
	issue := f.create(t, "Preserve this title")
	mux := http.NewServeMux()
	RegisterHTTP(httpapi.New(mux), f.service)
	call := func(body string, actor command.Actor) *httptest.ResponseRecorder {
		r := httptest.NewRequest("PATCH", "/api/v1/issues/"+issue.Summary.ID.String()+"/fields", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", uuid.NewString())
		r = r.WithContext(auth.WithActor(r.Context(), actor))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	for _, body := range []string{
		`{"field":"priority","priority":{"value":"high"}}`,
		`{"field":"assigneeId","assignee":{"value":null}}`,
		`{"field":"dueDate","dueDate":{"prior":null}}`,
		`{"field":"priority","priority":{"prior":"medium","value":"high"},"editable":{}}`,
	} {
		if w := call(body, f.member); w.Code != 422 {
			t.Fatal("missing prior/value or unknown body accepted", w.Code, w.Body.String())
		}
	}
	if w := call(`{"field":"priority","priority":{"prior":"medium","value":"high"}}`, f.viewer); w.Code != 403 {
		t.Fatal("viewer patch", w.Code)
	}
	w := call(`{"field":"priority","priority":{"prior":"medium","value":"high"}}`, f.member)
	var saved command.Saved[IssueView]
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &saved) != nil || saved.Result.Summary.Priority != command.High || saved.Result.Summary.Title != issue.Summary.Title {
		t.Fatal("typed patch response", w.Code, w.Body.String())
	}
	w = call(`{"field":"priority","priority":{"prior":"medium","value":"low"}}`, f.member)
	var failure IssueFailureBody
	if w.Code != 409 || json.Unmarshal(w.Body.Bytes(), &failure) != nil || failure.Current.Issue == nil || failure.Current.Issue.Summary.Priority != command.High {
		t.Fatal("selected-field conflict did not expose authorized current state", w.Code, w.Body.String())
	}
}
