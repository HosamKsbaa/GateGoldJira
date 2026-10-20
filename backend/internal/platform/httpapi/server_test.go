package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/danielgtaylor/huma/v2"
)

type testVerifier struct{}

func (testVerifier) Verify(_ context.Context, header string, channel command.Channel) (command.ProviderIdentity, error) {
	if header != "Bearer "+string(channel) {
		return command.ProviderIdentity{}, errors.New("invalid token secret-value")
	}
	return command.ProviderIdentity{Issuer: "http://test/", Subject: "human"}, nil
}
func testSessions() auth.Sessions {
	return auth.Sessions{Verifier: testVerifier{}, Location: time.UTC, Resolve: func(context.Context, command.ProviderIdentity) (command.UserID, error) {
		return command.NewID[command.UserKind](), nil
	}}
}
func TestRESTAuthenticationInputErrorsAndCORS(t *testing.T) {
	mux := http.NewServeMux()
	api := New(mux)
	type body struct {
		Title string `json:"title" minLength:"1" maxLength:"200"`
	}
	huma.Register(api, huma.Operation{
		OperationID: "transport_probe",
		Method:      "POST",
		Path:        "/probe",
	}, func(ctx context.Context, input *struct {
		MutationHeader
		Body body
	}) (*struct{ Body body }, error) {
		if _, err := auth.Actor(ctx); err != nil {
			return nil, err
		}
		return &struct{ Body body }{input.Body}, nil
	})
	handler := CORS([]string{"http://localhost:4200"}, Authenticated(testSessions(), command.REST, "", Bounded(Limits{
		RequestBytes:  command.MaximumPageBytes,
		ResponseBytes: command.MaximumPageBytes,
	}, mux)))
	for _, test := range []struct {
		name, token, origin, body string
		want                      int
	}{
		{"valid Unicode", "web", "http://localhost:4200", `{"title":"مراجعة العمل"}`, 200},
		{"no authentication", "", "", `{"title":"hello"}`, 401},
		{"wrong audience", "mcp", "", `{"title":"hello"}`, 401},
		{"foreign origin", "web", "https://evil.test", `{"title":"hello"}`, 403},
		{"unknown field", "web", "", `{"title":"hello","secret":"do-not-echo"}`, 422},
		{"malformed", "web", "", `{"title":`, 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/probe", strings.NewReader(test.body))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Idempotency-Key", command.NewID[command.EventKind]().String())
			if test.token != "" {
				r.Header.Set("Authorization", "Bearer "+test.token)
			}
			if test.origin != "" {
				r.Header.Set("Origin", test.origin)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != test.want {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
			if w.Code != 200 {
				var failure FailureBody
				if json.Unmarshal(w.Body.Bytes(), &failure) != nil || failure.Error.Code == "" {
					t.Fatal("untyped failure")
				}
				if bytes.Contains(w.Body.Bytes(), []byte("do-not-echo")) || bytes.Contains(w.Body.Bytes(), []byte("secret-value")) {
					t.Fatal("raw values leaked")
				}
			}
		})
	}
	r := httptest.NewRequest("OPTIONS", "/probe", nil)
	r.Header.Set("Origin", "http://localhost:4200")
	r.Header.Set("Access-Control-Request-Method", "PATCH")
	r.Header.Set("Access-Control-Request-Headers", "Authorization, Idempotency-Key")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:4200" {
		t.Fatal("allowed preflight failed")
	}
}
func TestBodyAndOutputLimitsAndTransferLease(t *testing.T) {
	gate := objectstore.NewTransferGate()
	called := false
	handler := Bounded(Limits{
		RequestBytes:  32,
		ResponseBytes: 32,
		Gate:          gate,
	}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		_, _ = w.Write([]byte(strings.Repeat("x", 33)))
	}))
	r := httptest.NewRequest("POST", "/", strings.NewReader(strings.Repeat("x", 33)))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 413 || called {
		t.Fatal("oversize body was decoded")
	}
	r = httptest.NewRequest("POST", "/", nil)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 503 || strings.Contains(w.Body.String(), strings.Repeat("x", 33)) {
		t.Fatal("oversize output escaped")
	}
	release1, _ := gate.Acquire(context.Background())
	defer release1()
	release2, _ := gate.Acquire(context.Background())
	defer release2()
	called = false
	r = httptest.NewRequest("POST", "/", strings.NewReader("chunked"))
	r.ContentLength = -1
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 503 || called {
		t.Fatal("unknown-length busy request reached decoder")
	}
}
func TestPublicReadinessRedactsDependencyFailure(t *testing.T) {
	mux := http.NewServeMux()
	PublicRoutes(mux, func(context.Context) error { return errors.New("database password secret") })
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/readyz", nil))
	if w.Code != 503 || strings.Contains(w.Body.String(), "secret") {
		t.Fatal("readiness leaked state")
	}
}
