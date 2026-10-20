package objectstore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func (s *Google) sessionURL(cap string) error {
	u, err := url.Parse(cap)
	if err != nil || u.Scheme != "https" || u.Host != "storage.googleapis.com" || u.User != nil || u.Fragment != "" || u.Path != "/upload/storage/v1/b/"+s.stagingBucket+"/o" || u.Query().Get("upload_id") == "" {
		return ErrGeneration
	}
	return nil
}
func (s *Google) resumeRequest(ctx context.Context, method, uri string, body []byte, contentRange string) (*http.Response, error) {
	if err := s.sessionURL(uri); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, uri, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.ContentLength = int64(len(body))
	if contentRange != "" {
		req.Header.Set("Content-Range", contentRange)
	}
	response, err := s.resumeClient.Do(req)
	if err != nil {
		return nil, errors.New("private upload request could not be confirmed")
	}
	return response, nil
}
func (s *Google) BeginResume(ctx context.Context, spec ResumeSpec) (string, error) {
	if err := spec.Validate(); err != nil {
		return "", err
	}
	body, _ := json.Marshal(struct {
		Name        string `json:"name"`
		ContentType string `json:"contentType"`
	}{string(spec.Key), spec.ContentType})
	endpoint := "https://storage.googleapis.com/upload/storage/v1/b/" + url.PathEscape(s.stagingBucket) + "/o?uploadType=resumable&ifGenerationMatch=0"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Upload-Content-Type", spec.ContentType)
	req.Header.Set("X-Upload-Content-Length", strconv.FormatInt(spec.Size, 10))
	response, err := s.resumeClient.Do(req)
	if err != nil {
		return "", errors.New("private upload initiation could not be confirmed")
	}
	defer response.Body.Close()
	io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		return "", ErrBusy
	}
	cap := response.Header.Get("Location")
	if err = s.sessionURL(cap); err != nil {
		return "", err
	}
	return cap, nil
}
func receivedRange(response *http.Response, total int64) (int64, error) {
	if response.StatusCode == 200 || response.StatusCode == 201 {
		return total, nil
	}
	if response.StatusCode != 308 {
		return 0, ErrBusy
	}
	value := response.Header.Get("Range")
	if value == "" {
		return 0, nil
	}
	if !strings.HasPrefix(value, "bytes=0-") {
		return 0, ErrGeneration
	}
	n, err := strconv.ParseInt(strings.TrimPrefix(value, "bytes=0-"), 10, 64)
	if err != nil || n < 0 || n >= total {
		return 0, ErrGeneration
	}
	return n + 1, nil
}
func (s *Google) AppendResume(ctx context.Context, cap string, spec ResumeSpec, offset int64, data []byte) (int64, error) {
	if spec.Validate() != nil || offset < 0 || len(data) < 1 || int64(len(data)) > ChunkSize || offset+int64(len(data)) > spec.Size || (offset+int64(len(data)) < spec.Size && len(data)%(256*1024) != 0) {
		return 0, ErrGeneration
	}
	// Reconcile a lost acknowledgement before sending bytes again.
	response, err := s.resumeRequest(ctx, http.MethodPut, cap, nil, fmt.Sprintf("bytes */%d", spec.Size))
	if err != nil {
		return 0, err
	}
	n, statusErr := receivedRange(response, spec.Size)
	response.Body.Close()
	if statusErr != nil {
		if info, inspectErr := s.Inspect(ctx, spec.Key, false); inspectErr == nil && info.Size == spec.Size {
			return spec.Size, nil
		}
		return 0, statusErr
	}
	if n == offset+int64(len(data)) {
		return n, nil
	}
	if n != offset {
		return 0, ErrGeneration
	}
	response, err = s.resumeRequest(ctx, http.MethodPut, cap, data, fmt.Sprintf("bytes %d-%d/%d", offset, offset+int64(len(data))-1, spec.Size))
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	n, err = receivedRange(response, spec.Size)
	if err != nil || n != offset+int64(len(data)) {
		return n, ErrBusy
	}
	return n, nil
}
func (s *Google) FinishResume(ctx context.Context, cap string, spec ResumeSpec) (Info, error) {
	if s.sessionURL(cap) != nil || spec.Validate() != nil {
		return Info{}, ErrGeneration
	}
	info, err := s.Inspect(ctx, spec.Key, false)
	if err != nil || info.Size != spec.Size || info.ContentType != spec.ContentType || info.SHA256 != spec.SHA256 {
		return Info{}, ErrGeneration
	}
	return info, nil
}
func (s *Google) CancelResume(ctx context.Context, cap string, spec ResumeSpec) error {
	if spec.Validate() != nil {
		return ErrGeneration
	}
	response, err := s.resumeRequest(ctx, http.MethodDelete, cap, nil, "")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == 499 || response.StatusCode == 204 || response.StatusCode == 404 || response.StatusCode == 410 {
		return nil
	}
	return ErrBusy
}
func (s *Google) OpenRange(ctx context.Context, key Key, expected Info, published bool, offset, count int64) (io.ReadCloser, error) {
	if key.Validate() != nil || expected.Validate() != nil || offset < 0 || count < 0 || offset+count > expected.Size {
		return nil, ErrGeneration
	}
	bucket := s.stagingBucket
	if published {
		bucket = s.publishedBucket
	}
	object := s.client.Bucket(bucket).Object(string(key)).Generation(expected.Generation)
	attrs, err := object.Attrs(ctx)
	if err != nil {
		return nil, ErrNotFound
	}
	if attrs.Size != expected.Size || attrs.ContentType != expected.ContentType || attrs.Metadata["sha256"] != expected.SHA256 {
		return nil, ErrGeneration
	}
	return object.NewRangeReader(ctx, offset, count)
}
