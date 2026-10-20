package objectstore

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type resumeTransport func(*http.Request) (*http.Response, error)

func (f resumeTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestGoogleResumableProtocolKeepsCapabilitiesPrivateAndReconcilesOffsets(t *testing.T) {
	const cap = "https://storage.googleapis.com/upload/storage/v1/b/private-staging/o?uploadType=resumable&upload_id=private-capability"
	calls := 0
	client := &http.Client{Transport: resumeTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		response := &http.Response{StatusCode: 308, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(""))}
		switch calls {
		case 1:
			if r.Method != "POST" || r.URL.Query().Get("ifGenerationMatch") != "0" || r.Header.Get("X-Upload-Content-Length") != "1048577" {
				t.Fatal("wrong initiation metadata")
			}
			response.StatusCode = 200
			response.Header.Set("Location", cap)
		case 2:
			if r.Method != "PUT" || r.Header.Get("Content-Range") != "bytes */1048577" || r.ContentLength != 0 {
				t.Fatal("missing offset reconciliation")
			}
		case 3:
			if r.Method != "PUT" || r.Header.Get("Content-Range") != "bytes 0-1048575/1048577" || r.ContentLength != 1048576 {
				t.Fatal("wrong bounded chunk")
			}
			response.Header.Set("Range", "bytes=0-1048575")
		case 4:
			response.Header.Set("Range", "bytes=0-1048575")
		case 5:
			if r.Method != "DELETE" {
				t.Fatal("cancellation method")
			}
			response.StatusCode = 499
		default:
			t.Fatal("duplicate data transfer")
		}
		return response, nil
	})}
	store := &Google{stagingBucket: "private-staging", resumeClient: client}
	spec := ResumeSpec{
		Key:         "uploads/file",
		Size:        ChunkSize + 1,
		ContentType: "application/octet-stream",
		SHA256:      strings.Repeat("0", 64),
	}
	received, err := store.BeginResume(context.Background(), spec)
	if err != nil || received != cap {
		t.Fatal("begin failed")
	}
	data := bytes.Repeat([]byte{0x41}, int(ChunkSize))
	n, err := store.AppendResume(context.Background(), cap, spec, 0, data)
	if err != nil || n != ChunkSize {
		t.Fatal("append failed")
	}
	n, err = store.AppendResume(context.Background(), cap, spec, 0, data)
	if err != nil || n != ChunkSize {
		t.Fatal("lost ack not reconciled")
	}
	if err = store.CancelResume(context.Background(), cap, spec); err != nil {
		t.Fatal("cancel failed")
	}
	for _, unsafe := range []string{
		"http://storage.googleapis.com/upload/storage/v1/b/private-staging/o?upload_id=a",
		"https://example.test/upload/storage/v1/b/private-staging/o?upload_id=a",
		"https://storage.googleapis.com/upload/storage/v1/b/another-bucket/o?upload_id=a",
	} {
		if store.sessionURL(unsafe) == nil {
			t.Fatal("untrusted capability accepted")
		}
	}
	if calls != 5 {
		t.Fatal("unexpected transfer count", calls)
	}
}
