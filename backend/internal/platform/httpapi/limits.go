package httpapi

import (
	"bytes"
	"context"
	"errors"
	"github.com/google/uuid"
	"io"
	"net/http"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
)

const MaximumTransportBytes = 16 * 1024 * 1024

type Limits struct {
	RequestBytes  int64
	ResponseBytes int
	Gate          *objectstore.TransferGate
	Transfer      bool
	Stream        bool
}

// Authentication wraps this handler, so rejected identities consume no large
// transfer capacity. Acquire unknown/large bodies before any framework decode.
func Bounded(limits Limits, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		controller := http.NewResponseController(w)
		_ = controller.SetReadDeadline(time.Now().Add(30 * time.Second))
		_ = controller.SetWriteDeadline(time.Now().Add(30 * time.Second))
		if r.ContentLength > limits.RequestBytes {
			WriteError(w, validationError(413))
			return
		}
		if limits.Gate != nil {
			var lease *objectstore.TransferLease
			ctx, lease = objectstore.WithTransfer(ctx, limits.Gate)
			defer lease.Close()
			if limits.Transfer || r.ContentLength < 0 || r.ContentLength >= command.MaximumPageBytes {
				if err := lease.Acquire(ctx); err != nil {
					WriteError(w, transferFailure())
					return
				}
			}
		}
		r = r.WithContext(ctx)
		r.Body = http.MaxBytesReader(w, r.Body, limits.RequestBytes)
		if limits.Stream {
			next.ServeHTTP(w, r)
			return
		}
		buffer := &boundedResponse{header: w.Header().Clone(), limit: limits.ResponseBytes}
		next.ServeHTTP(buffer, r)
		if buffer.overflow {
			WriteError(w, Error(errors.New("response budget exceeded")))
			return
		}
		for name := range w.Header() {
			w.Header().Del(name)
		}
		for name, values := range buffer.header {
			w.Header()[name] = values
		}
		status := buffer.status
		if status == 0 {
			status = 200
		}
		w.WriteHeader(status)
		_, _ = io.Copy(w, &buffer.body)
	})
}
func transferFailure() *StatusError {
	return Error(&command.Failure{
		Code:        command.Busy,
		Message:     "Picture transfer capacity is busy. Retry the original request.",
		FieldErrors: []command.FieldError{},
		Retryable:   true,
		NextAction:  command.RetrySameReference,
	})
}

type boundedResponse struct {
	header   http.Header
	status   int
	body     bytes.Buffer
	limit    int
	overflow bool
}

func (w *boundedResponse) Header() http.Header { return w.header }
func (w *boundedResponse) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
}
func (w *boundedResponse) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = 200
	}
	if len(data) > w.limit-w.body.Len() {
		w.overflow = true
		return 0, errors.New("response exceeds budget")
	}
	return w.body.Write(data)
}

// Business paths are matched exactly; ordinary payloads keep the 1 MiB budget.
func FeatureLimits(gate *objectstore.TransferGate, next http.Handler) http.Handler {
	ordinary := Bounded(Limits{
		RequestBytes:  command.MaximumPageBytes,
		ResponseBytes: command.MaximumPageBytes,
		Gate:          gate,
	}, next)
	upload := Bounded(Limits{
		RequestBytes:  MaximumTransportBytes,
		ResponseBytes: command.MaximumPageBytes,
		Gate:          gate,
		Transfer:      true,
	}, next)
	content := Bounded(Limits{
		RequestBytes:  command.MaximumPageBytes,
		ResponseBytes: MaximumTransportBytes,
		Gate:          gate,
		Transfer:      true,
		Stream:        true,
	}, next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/"), "/")
		if len(parts) == 3 {
			id, err := uuid.Parse(parts[1])
			if err == nil && id != uuid.Nil {
				if parts[0] == "issues" && (parts[2] == "pictures" || parts[2] == "attachments" || parts[2] == "assets") && r.Method == "POST" {
					upload.ServeHTTP(w, r)
					return
				}
				if parts[0] == "asset-uploads" && (parts[2] == "chunks" || parts[2] == "finalize") && r.Method == "POST" {
					upload.ServeHTTP(w, r)
					return
				}
				if parts[0] == "assets" && parts[2] == "chunk" && r.Method == "GET" {
					content.ServeHTTP(w, r)
					return
				}
				if (parts[0] == "pictures" || parts[0] == "attachments") && parts[2] == "content" && r.Method == "GET" {
					content.ServeHTTP(w, r)
					return
				}
			}
		}
		ordinary.ServeHTTP(w, r)
	})
}
