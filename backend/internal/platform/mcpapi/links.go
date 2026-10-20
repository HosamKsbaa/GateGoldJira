package mcpapi

import (
	"context"
	"net/url"
	"strings"

	"gategoldjira/backend/internal/platform/command"
)

type applicationURLKey struct{}
type ResourceLink struct {
	URL   string `json:"url" format:"uri"`
	Title string `json:"title"`
}

func resultLinks(ctx context.Context, out any) []ResourceLink {
	resource, ok := out.(command.BrowserResource)
	if !ok {
		return nil
	}
	target := resource.BrowserResource()
	if !strings.HasPrefix(target.Path, "/") || strings.HasPrefix(target.Path, "//") {
		return nil
	}
	configured, _ := ctx.Value(applicationURLKey{}).(string)
	base, err := url.Parse(configured)
	if err != nil || base.Host == "" || (base.Scheme != "http" && base.Scheme != "https") || base.User != nil {
		return nil
	}
	path, err := url.Parse(target.Path)
	if err != nil {
		return nil
	}
	return []ResourceLink{{URL: base.ResolveReference(path).String(), Title: target.Title}}
}
