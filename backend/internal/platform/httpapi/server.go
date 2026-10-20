// Package httpapi configures transports; business rules stay in feature services.
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
	"github.com/google/uuid"
)

func New(mux *http.ServeMux) huma.API {
	settings := huma.DefaultConfig("GateGoldJira", "1.0.0")
	settings.OpenAPIPath, settings.DocsPath, settings.SchemasPath = "", "", ""
	settings.Transformers, settings.CreateHooks = nil, nil
	settings.RejectUnknownQueryParameters = true
	settings.Components.SecuritySchemes = map[string]*huma.SecurityScheme{"humanBearer": {
		Type:         "http",
		Scheme:       "bearer",
		BearerFormat: "JWT",
	}}
	settings.Security = []map[string][]string{{"humanBearer": {}}}
	return humago.New(mux, settings)
}

func WriteError(w http.ResponseWriter, failure *StatusError) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(failure.Status)
	_ = json.NewEncoder(w).Encode(failure.FailureBody)
}

func Authenticated(sessions auth.Sessions, channel command.Channel, challenge string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, err := sessions.Authenticate(r.Context(), r.Header.Get("Authorization"), channel)
		if err != nil {
			failure := Error(err)
			if failure.Status == http.StatusUnauthorized && challenge != "" {
				w.Header().Set("WWW-Authenticate", challenge)
			}
			WriteError(w, failure)
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithActor(r.Context(), actor)))
	})
}

func CORS(origins []string, next http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	for _, origin := range origins {
		allowed[origin] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin")
		if origin != "" && !allowed[origin] {
			WriteError(w, validationError(http.StatusForbidden))
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID, WWW-Authenticate, MCP-Protocol-Version")
		}
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			method := r.Header.Get("Access-Control-Request-Method")
			if origin == "" || (method != "GET" && method != "POST" && method != "PUT" && method != "PATCH") {
				WriteError(w, validationError(403))
				return
			}
			for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
				switch strings.ToLower(strings.TrimSpace(header)) {
				case "", "authorization", "content-type", "idempotency-key", "mcp-protocol-version", "mcp-session-id", "mcp-method", "mcp-name":
				default:
					WriteError(w, validationError(403))
					return
				}
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, MCP-Protocol-Version, MCP-Session-Id, MCP-Method, MCP-Name")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func PublicRoutes(mux *http.ServeMux, ready func(context.Context) error) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		w.Header().Set("Content-Type", "application/json")
		if ready(ctx) != nil {
			w.WriteHeader(503)
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})
}
func RequestLog(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, start := uuid.NewString(), time.Now()
		w.Header().Set("X-Request-ID", id)
		response := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(response, r)
		logger.Info("request completed", "request_id", id, "method", r.Method, "status", response.status, "duration_ms", time.Since(start).Milliseconds())
	})
}

type statusWriter struct {
	http.ResponseWriter
	status  int
	written bool
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *statusWriter) WriteHeader(status int) {
	if !w.written {
		w.status, w.written = status, true
		w.ResponseWriter.WriteHeader(status)
	}
}
func (w *statusWriter) Write(data []byte) (int, error) {
	if !w.written {
		w.WriteHeader(200)
	}
	return w.ResponseWriter.Write(data)
}

type MutationHeader struct {
	RetryReference string `header:"Idempotency-Key" required:"true" format:"uuid"`
}
