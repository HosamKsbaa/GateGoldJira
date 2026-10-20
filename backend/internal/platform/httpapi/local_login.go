package httpapi

import (
	"context"
	"net/http"
	"reflect"
	"strconv"

	"gategoldjira/backend/internal/platform/auth"
	"github.com/danielgtaylor/huma/v2"
)

const LocalLoginPath = "/api/v1/auth/local-sign-in"
const PasswordLoginPath = "/api/v1/auth/password-sign-in"

func RegisterLocalLogin(api huma.API, login *auth.LocalLogin) {
	registerPasswordLogin(api, login, "localSignIn", LocalLoginPath, "Sign in to local development with a test username and password")
}

func RegisterPasswordLogin(api huma.API, login *auth.LocalLogin) {
	registerPasswordLogin(api, login, "passwordSignIn", PasswordLoginPath, "Sign in with an operator-provisioned company username and password")
}

func registerPasswordLogin(api huma.API, login *auth.LocalLogin, operation, path, summary string) {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{Description: "Safe sign-in failure", Content: map[string]*huma.MediaType{"application/json": {
			Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[FailureBody](), true, ""),
		}}}
	}
	huma.Register(api, huma.Operation{OperationID: operation, Method: http.MethodPost, Path: path,
		Summary: summary, Tags: []string{"Password authentication"},
		Security: []map[string][]string{}, Responses: responses, MaxBodyBytes: 16 * 1024},
		func(ctx context.Context, input *struct{ Body auth.LocalCredentials }) (*struct {
			CacheControl string `header:"Cache-Control"`
			Body         auth.LocalSession
		}, error) {
			if login == nil {
				return nil, validationError(http.StatusNotFound)
			}
			session, err := login.SignIn(ctx, input.Body)
			if err != nil {
				return nil, Error(err)
			}
			return &struct {
				CacheControl string `header:"Cache-Control"`
				Body         auth.LocalSession
			}{CacheControl: "no-store", Body: session}, nil
		})
}

func LocalLoginHandler(next http.Handler) http.Handler {
	bounded := Bounded(Limits{RequestBytes: 16 * 1024, ResponseBytes: 16 * 1024}, next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		bounded.ServeHTTP(w, r)
	})
}
