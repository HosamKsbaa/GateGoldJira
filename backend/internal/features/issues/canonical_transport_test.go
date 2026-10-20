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

func TestCanonicalHTTPFailuresKeepTypedCurrentAndAuthorizationEnvelope(t *testing.T) {
	f := modernIssueFixture(t)
	issue := f.createModern(t, "Typed conflict response")
	date, _ := command.ParseDate("2027-06-01")
	changed, err := f.service.PatchModernField(context.Background(), f.member, ModernPatchInput{
		IssueID: issue.Summary.ID,
		ModernPatchFields: ModernPatchFields{
			Field:   DueDateField,
			DueDate: &DateChange{Value: &date},
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	RegisterHTTP(httpapi.New(mux), f.service)
	call := func(actor *command.Actor) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPatch, "/api/v2/issues/"+issue.Summary.ID.String()+"/fields", strings.NewReader(`{"field":"dueDate","dueDate":{"prior":null,"value":"2027-05-21"}}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", uuid.NewString())
		if actor != nil {
			req = req.WithContext(auth.WithActor(req.Context(), *actor))
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		return w
	}
	for _, test := range []struct {
		name       string
		actor      *command.Actor
		status     int
		code       command.FailureCode
		hasCurrent bool
	}{
		{
			"conflict",
			&f.member,
			409,
			command.Conflict,
			true,
		},
		{
			"viewer",
			&f.viewer,
			403,
			command.Forbidden,
			false,
		},
		{
			"unsigned",
			nil,
			401,
			command.Unauthenticated,
			false,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			w := call(test.actor)
			var body ModernIssueFailureBody
			if w.Code != test.status || json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Error.Code != test.code || body.Error.FieldErrors == nil {
				t.Fatal("typed failure missing", w.Code, w.Body.String())
			}
			if (body.Current.Value != nil) != test.hasCurrent {
				t.Fatal("incorrect current visibility", w.Body.String())
			}
			if body.Current.Value != nil && (body.Current.Value.Summary.Revision != changed.Body.Result.Summary.Revision || body.Current.Value.Summary.DueDate.String() != date.String()) {
				t.Fatal("stale conflict snapshot")
			}
			if body.Unfinished.Value != nil {
				t.Fatal("unexpected prerequisite records")
			}
		})
	}
}
