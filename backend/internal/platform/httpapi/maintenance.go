package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"google.golang.org/api/idtoken"
)

type serviceIdentity struct {
	email    string
	verified bool
	issuer   string
}
type serviceVerifier func(context.Context, string, string) (serviceIdentity, error)

func googleServiceToken(ctx context.Context, token, audience string) (serviceIdentity, error) {
	payload, err := idtoken.Validate(ctx, token, audience)
	if err != nil {
		return serviceIdentity{}, err
	}
	// Dynamic values remain at Google's verified JWT boundary only.
	email, _ := payload.Claims["email"].(string)
	verified, _ := payload.Claims["email_verified"].(bool)
	return serviceIdentity{email, verified, payload.Issuer}, nil
}
func RegisterMaintenance[T any](mux *http.ServeMux, audience string, emails []string, run func(context.Context) (T, error)) {
	if audience == "" || len(emails) == 0 {
		return
	}
	registerMaintenance(mux, audience, emails, googleServiceToken, run)
}
func registerMaintenance[T any](mux *http.ServeMux, audience string, emails []string, verify serviceVerifier, run func(context.Context) (T, error)) {
	allowed := map[string]bool{}
	for _, email := range emails {
		if strings.HasSuffix(email, ".gserviceaccount.com") {
			allowed[email] = true
		}
	}
	mux.HandleFunc("POST /internal/maintenance/pictures", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" || strings.ContainsAny(token, " \t\r\n") {
			WriteError(w, validationError(401))
			return
		}
		identity, err := verify(ctx, token, audience)
		if err != nil || !identity.verified || (identity.issuer != "https://accounts.google.com" && identity.issuer != "accounts.google.com") || !allowed[identity.email] {
			WriteError(w, validationError(401))
			return
		}
		if r.ContentLength > 0 {
			WriteError(w, validationError(400))
			return
		}
		out, err := run(ctx)
		if err != nil {
			WriteError(w, Error(err))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(out)
	})
}
