package issues

import (
	"context"
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

// Exercise concrete public routes before adding label providers, then reuse the
// same route and typed result checks for create/reuse, paging and current access.
func TestLabelsRESTCreateReusePagingAndDeniedWrites(t *testing.T) {
	f := issueDatabase(t)
	mux := http.NewServeMux()
	RegisterHTTP(httpapi.New(mux), f.service)
	send := func(actor command.Actor, method, path, body, ref string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", ref)
		r = r.WithContext(auth.WithActor(r.Context(), actor))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	path := "/projects/" + f.project.String() + "/labels"
	first := send(f.member, "POST", path, `{"name":"Release"}`, uuid.NewString())
	if first.Code != 201 {
		t.Fatalf("create_label must save a label, got %d: %s", first.Code, first.Body.String())
	}
	var created command.Saved[LabelView]
	if err := json.Unmarshal(first.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	reused := send(f.member, "POST", path, `{"name":" release "}`, uuid.NewString())
	var same command.Saved[LabelView]
	if reused.Code != 200 || json.Unmarshal(reused.Body.Bytes(), &same) != nil || same.Result.ID != created.Result.ID || same.Receipt.EventID != nil {
		t.Fatal("casefold reuse did not preserve identity", reused.Code, reused.Body.String())
	}
	for _, name := range []string{"عاجل", "Straße", "STRASSE"} {
		body, _ := json.Marshal(struct {
			Name string `json:"name"`
		}{name})
		w := send(f.member, "POST", path, string(body), uuid.NewString())
		if w.Code != 201 && w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), "SELECT count(*) FROM labels WHERE project_id=$1", f.project.UUID).Scan(&count); err != nil || count != 3 {
		t.Fatal("full Unicode casefold did not reuse Straße", count, err)
	}
	w := send(f.viewer, "GET", path+"?limit=1", "", "")
	var page command.Page[LabelView]
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil || len(page.Items) != 1 || page.TotalMatching != 3 || page.NextCursor == nil {
		t.Fatal("bounded label page", w.Code, w.Body.String())
	}
	for _, actor := range []command.Actor{f.viewer} {
		if w := send(actor, "POST", path, `{"name":"Denied"}`, uuid.NewString()); w.Code != 403 {
			t.Fatal("Viewer created label", w.Code)
		}
	}
	if _, err := f.pool.Exec(context.Background(), "UPDATE projects SET archived_at=now() WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if w := send(f.member, "POST", path, `{"name":"Denied"}`, uuid.NewString()); w.Code != 403 {
		t.Fatal("archived project accepted label", w.Code, w.Body.String())
	}
	if w := send(f.viewer, "GET", path, "", ""); w.Code != 200 {
		t.Fatal("archived reading denied", w.Code)
	}
}
