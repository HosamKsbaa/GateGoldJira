package issues

import (
	"bytes"
	"gategoldjira/backend/internal/platform/command"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"net/url"
	"strconv"
	"strings"
)

// Descriptions accept formatting, but references to private pictures and mentions
// belong to the existing comment/gallery services and are not executable markup.
func cleanDescription(source string) (string, error) {
	root := &html.Node{Type: html.ElementNode, Data: "div", DataAtom: atom.Div}
	nodes, err := html.ParseFragment(strings.NewReader(source), root)
	if err != nil {
		return "", validation("description", "Description HTML could not be parsed.")
	}
	var appendNode func(*html.Node, *html.Node)
	appendNode = func(parent, node *html.Node) {
		if node.Type == html.TextNode {
			parent.AppendChild(&html.Node{Type: html.TextNode, Data: node.Data})
			return
		}
		if node.Type != html.ElementNode {
			return
		}
		tag := node.Data
		switch tag {
		case "script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "input", "button":
			return
		case "img":
			var idText, alt string
			for _, a := range node.Attr {
				if a.Namespace == "" && a.Key == "data-picture-id" {
					idText = a.Val
				}
				if a.Namespace == "" && a.Key == "alt" {
					alt = a.Val
				}
			}
			if idText == "" {
				return
			}
			id, err := command.ParseID[command.PictureKind](idText)
			if err != nil {
				return
			}
			if command.ValidateText(alt, 1, 200) != nil {
				alt = "Uploaded picture"
			}
			parent.AppendChild(&html.Node{
				Type:     html.ElementNode,
				Data:     "img",
				DataAtom: atom.Img,
				Attr: []html.Attribute{
					{Key: "data-picture-id", Val: id.String()},
					{Key: "alt", Val: alt},
				},
			})
			return
		case "b":
			tag = "strong"
		case "i":
			tag = "em"
		}
		out := parent
		switch tag {
		case "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "u", "ul", "ol", "li", "blockquote", "br", "a", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "td", "th":
			out = &html.Node{Type: html.ElementNode, Data: tag, DataAtom: atom.Lookup([]byte(tag))}
			for _, attr := range node.Attr {
				if attr.Namespace != "" {
					continue
				}
				if attr.Key == "dir" && (attr.Val == "rtl" || attr.Val == "ltr" || attr.Val == "auto") && (tag == "p" || strings.HasPrefix(tag, "h") || tag == "li" || tag == "blockquote" || tag == "pre" || tag == "td" || tag == "th") {
					out.Attr = append(out.Attr, attr)
				}
				if attr.Key == "data-type" && ((tag == "ul" && attr.Val == "taskList") || (tag == "li" && attr.Val == "taskItem")) {
					out.Attr = append(out.Attr, attr)
				}
				if attr.Key == "data-checked" && tag == "li" && (attr.Val == "true" || attr.Val == "false") {
					out.Attr = append(out.Attr, attr)
				}
				if (tag == "td" || tag == "th") && (attr.Key == "colspan" || attr.Key == "rowspan") {
					span, err := strconv.Atoi(attr.Val)
					if err == nil && span >= 1 && span <= 20 && strconv.Itoa(span) == attr.Val {
						out.Attr = append(out.Attr, attr)
					}
				}
				if tag == "a" && attr.Key == "data-attachment-id" {
					if id, err := command.ParseID[command.AssetKind](attr.Val); err == nil {
						out.Attr = append(out.Attr, html.Attribute{Key: "data-attachment-id", Val: id.String()})
					}
				}
				if tag == "a" && attr.Key == "href" {
					value := strings.TrimSpace(attr.Val)
					target, err := url.Parse(value)
					if err == nil && (target.Scheme == "http" || target.Scheme == "https") && target.Host != "" && target.User == nil {
						out.Attr = append(out.Attr, html.Attribute{Key: "href", Val: value})
					}
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			appendNode(out, child)
		}
		if out != parent {
			parent.AppendChild(out)
		}
	}
	for _, node := range nodes {
		appendNode(root, node)
	}
	var output bytes.Buffer
	for node := root.FirstChild; node != nil; node = node.NextSibling {
		if err := html.Render(&output, node); err != nil {
			return "", err
		}
	}
	value := output.String()
	if command.ValidateText(value, 0, 10000) != nil {
		return "", validation("description", "Use at most 10000 characters of description HTML.")
	}
	return value, nil
}
