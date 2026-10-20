package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMaintenanceRequiresExactGoogleServiceIdentityAndAudience(t *testing.T) {
	for _, scenario := range []struct {
		name     string
		identity serviceIdentity
		token    string
		status   int
	}{
		{
			"allowed",
			serviceIdentity{
				"cleanup@test.iam.gserviceaccount.com",
				true,
				"https://accounts.google.com",
			},
			"service",
			200,
		},
		{
			"human",
			serviceIdentity{
				"person@example.test",
				true,
				"https://accounts.google.com",
			},
			"human",
			401,
		},
		{
			"other-service",
			serviceIdentity{
				"other@test.iam.gserviceaccount.com",
				true,
				"https://accounts.google.com",
			},
			"service",
			401,
		},
		{
			"unverified",
			serviceIdentity{
				"cleanup@test.iam.gserviceaccount.com",
				false,
				"https://accounts.google.com",
			},
			"service",
			401,
		},
		{
			"auth0",
			serviceIdentity{
				"cleanup@test.iam.gserviceaccount.com",
				true,
				"https://tenant.auth0.com/",
			},
			"service",
			401,
		},
		{"anonymous", serviceIdentity{}, "", 401},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			mux := http.NewServeMux()
			calls := 0
			registerMaintenance(mux, "https://api.example.test/internal/maintenance/pictures", []string{"cleanup@test.iam.gserviceaccount.com"}, func(_ context.Context, token, audience string) (serviceIdentity, error) {
				if token != scenario.token || audience != "https://api.example.test/internal/maintenance/pictures" {
					t.Fatal("audience substituted")
				}
				return scenario.identity, nil
			}, func(context.Context) (struct {
				OK bool `json:"ok"`
			}, error) {
				calls++
				return struct {
					OK bool `json:"ok"`
				}{true}, nil
			})
			r := httptest.NewRequest("POST", "/internal/maintenance/pictures", nil)
			if scenario.token != "" {
				r.Header.Set("Authorization", "Bearer "+scenario.token)
			}
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, r)
			if w.Code != scenario.status || calls != map[bool]int{true: 1, false: 0}[scenario.status == 200] {
				t.Fatal("service gate failed", w.Code, calls)
			}
		})
	}
}
