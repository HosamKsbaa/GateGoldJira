package attachments

import (
	"gategoldjira/backend/internal/platform/command"
	"golang.org/x/net/html"
	"net/url"
	"sort"
	"strings"
)

// Saved HTML remains unchanged. Recognize both the protected marker and older
// issue links so historical document references remain retention roots.
func FileReferences(value string, issue command.IssueID) []command.AssetID {
	document, err := html.Parse(strings.NewReader(value))
	if err != nil {
		return nil
	}
	ids := map[command.AssetID]bool{}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "a" {
			for _, attribute := range node.Attr {
				var text string
				if attribute.Key == "data-attachment-id" {
					text = attribute.Val
				}
				if attribute.Key == "href" {
					link, err := url.Parse(attribute.Val)
					if err == nil && link.Path == "/issues/"+issue.String() {
						text = link.Query().Get("attachment")
					}
				}
				id, err := command.ParseID[command.AssetKind](text)
				if err == nil {
					ids[id] = true
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(document)
	result := make([]command.AssetID, 0, len(ids))
	for id := range ids {
		result = append(result, id)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].String() < result[j].String() })
	return result
}
