package comments

import (
	"bytes"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"gategoldjira/backend/internal/platform/command"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type CanonicalBody struct {
	SafeHTML          string
	PlainText         string
	SanitationNotices []string
}
type htmlCleaner struct {
	files        map[command.AssetID]string
	seenFiles    map[command.AssetID]bool
	issueID      command.IssueID
	users        map[command.UserID]string
	pictures     map[command.PictureID]string
	seenUsers    map[command.UserID]bool
	seenPictures map[command.PictureID]bool
	notices      []string
	imageCount   int
}

func invalidBody(field, message string) error {
	return &command.Failure{
		Code:        command.Validation,
		Message:     message,
		FieldErrors: []command.FieldError{{Field: field, Message: message}},
		NextAction:  command.ReviewFields,
	}
}
func (c *htmlCleaner) notice() {
	if len(c.notices) == 0 {
		c.notices = append(c.notices, "Unsupported formatting, attributes or unsafe content were removed.")
	}
}
func attribute(n *html.Node, key string) (string, bool) {
	for _, a := range n.Attr {
		if a.Namespace == "" && a.Key == key {
			return a.Val, true
		}
	}
	return "", false
}
func block(tag string) bool {
	switch tag {
	case "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "td", "th":
		return true
	}
	return false
}
func element(tag string) *html.Node {
	return &html.Node{Type: html.ElementNode, Data: tag, DataAtom: atom.Lookup([]byte(tag))}
}
func (c *htmlCleaner) append(parent, n *html.Node) error {
	if n.Type == html.TextNode {
		parent.AppendChild(&html.Node{Type: html.TextNode, Data: n.Data})
		return nil
	}
	if n.Type != html.ElementNode {
		c.notice()
		return nil
	}
	tag := n.Data
	switch tag {
	case "script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "input", "button":
		c.notice()
		return nil
	case "b":
		tag = "strong"
	case "i":
		tag = "em"
	}
	out := element(tag)
	allowed := map[string]bool{}
	switch tag {
	case "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "u", "ul", "ol", "li", "blockquote", "br", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "td", "th":
	case "a":
		if text, protected := attribute(n, "data-attachment-id"); protected {
			id, err := command.ParseID[command.AssetKind](text)
			if err != nil {
				return invalidBody("body.attachmentIds", "A file reference has an invalid identifier.")
			}
			label, ok := c.files[id]
			if !ok {
				return invalidBody("body.attachmentIds", "A selected file is unavailable.")
			}
			c.seenFiles[id] = true
			out.Attr = []html.Attribute{
				{Key: "data-attachment-id", Val: id.String()},
				{
					Key: "href",
					Val: "/issues/" + c.issueID.String() + "?attachment=" + id.String(),
				},
			}
			out.AppendChild(&html.Node{Type: html.TextNode, Data: label})
			parent.AppendChild(out)
			return nil
		}
		href, ok := attribute(n, "href")
		parsed, err := url.Parse(strings.TrimSpace(href))
		if ok && err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != "" && parsed.User == nil {
			out.Attr = append(out.Attr, html.Attribute{Key: "href", Val: strings.TrimSpace(href)})
			allowed["href"] = true
		} else {
			c.notice()
			out = parent
		}
	case "span":
		idText, ok := attribute(n, "data-user-id")
		if !ok {
			c.notice()
			out = parent
			break
		}
		id, err := command.ParseID[command.UserKind](idText)
		if err != nil {
			return invalidBody("body.mentionUserIds", "A selected mention has an invalid identifier.")
		}
		label, ok := c.users[id]
		if !ok || command.ValidateText(label, 1, 100) != nil {
			return invalidBody("body.mentionUserIds", "A selected mention is unavailable.")
		}
		c.seenUsers[id] = true
		out.Attr = []html.Attribute{{Key: "data-user-id", Val: id.String()}}
		out.AppendChild(&html.Node{Type: html.TextNode, Data: label})
		allowed["data-user-id"] = true
		for _, a := range n.Attr {
			if !allowed[a.Key] || a.Namespace != "" {
				c.notice()
			}
		}
		parent.AppendChild(out)
		return nil
	case "img":
		idText, ok := attribute(n, "data-picture-id")
		if !ok {
			c.notice()
			return nil
		}
		id, err := command.ParseID[command.PictureKind](idText)
		if err != nil {
			return invalidBody("body.pictureIds", "An inline picture has an invalid identifier.")
		}
		description, ok := c.pictures[id]
		if !ok || command.ValidateText(description, 1, 200) != nil {
			return invalidBody("body.pictureIds", "An inline picture is unavailable.")
		}
		c.seenPictures[id] = true
		c.imageCount++
		if c.imageCount > 5 {
			return invalidBody("body.pictureIds", "Use at most five inline pictures.")
		}
		out.Attr = []html.Attribute{{Key: "data-picture-id", Val: id.String()}, {Key: "alt", Val: description}}
		allowed["data-picture-id"] = true
		allowed["alt"] = true
		for _, a := range n.Attr {
			if !allowed[a.Key] || a.Namespace != "" {
				c.notice()
			}
		}
		parent.AppendChild(out)
		return nil
	default:
		c.notice()
		out = parent
	}
	if out != parent {
		if kind, ok := attribute(n, "data-type"); ok && ((tag == "ul" && kind == "taskList") || (tag == "li" && kind == "taskItem")) {
			out.Attr = append(out.Attr, html.Attribute{Key: "data-type", Val: kind})
			allowed["data-type"] = true
			if tag == "li" {
				checked, _ := attribute(n, "data-checked")
				if checked != "true" && checked != "false" {
					checked = "false"
					c.notice()
				}
				out.Attr = append(out.Attr, html.Attribute{Key: "data-checked", Val: checked})
				allowed["data-checked"] = true
			}
		}
		if tag == "td" || tag == "th" {
			for _, key := range []string{"colspan", "rowspan"} {
				if raw, ok := attribute(n, key); ok {
					span, err := strconv.Atoi(raw)
					if err == nil && span >= 1 && span <= 20 && strconv.Itoa(span) == raw {
						out.Attr = append(out.Attr, html.Attribute{Key: key, Val: raw})
						allowed[key] = true
					}
				}
			}
		}
	}
	if out != parent && block(tag) {
		if dir, ok := attribute(n, "dir"); ok && (dir == "auto" || dir == "rtl" || dir == "ltr") {
			out.Attr = append(out.Attr, html.Attribute{Key: "dir", Val: dir})
			allowed["dir"] = true
		}
	}
	for _, a := range n.Attr {
		if !allowed[a.Key] || a.Namespace != "" {
			c.notice()
		}
	}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		if err := c.append(out, child); err != nil {
			return err
		}
	}
	if out != parent {
		parent.AppendChild(out)
	}
	return nil
}
func plain(n *html.Node, b *strings.Builder, visible *int) {
	if n.Type == html.TextNode {
		b.WriteString(n.Data)
		*visible += utf8.RuneCountInString(n.Data)
		return
	}
	if n.Data == "img" {
		description, _ := attribute(n, "alt")
		b.WriteString("[" + description + "]")
		return
	}
	if n.Data == "br" {
		b.WriteByte('\n')
		*visible++
		return
	}
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		plain(child, b, visible)
	}
	if block(n.Data) || n.Data == "ul" || n.Data == "ol" {
		if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
			b.WriteByte('\n')
		}
	}
}
func Canonicalize(body Body, users map[command.UserID]string, pictures map[command.PictureID]string) (CanonicalBody, error) {
	return CanonicalizeWithFiles(body, users, pictures, nil, command.IssueID{})
}
func CanonicalizeWithFiles(body Body, users map[command.UserID]string, pictures map[command.PictureID]string, files map[command.AssetID]string, issue command.IssueID) (CanonicalBody, error) {
	empty := CanonicalBody{}
	if len(body.HTML) > 65536 || !utf8.ValidString(body.HTML) {
		return empty, invalidBody("body.html", "Comment HTML must be valid Unicode and at most 64 KiB.")
	}
	if body.MentionUserIDs == nil || body.PictureIDs == nil || len(body.PictureIDs) > 5 {
		return empty, invalidBody("body", "Supply explicit mention and picture ID collections, with at most five pictures.")
	}
	c := htmlCleaner{
		files:        files,
		seenFiles:    map[command.AssetID]bool{},
		issueID:      issue,
		users:        users,
		pictures:     pictures,
		seenUsers:    map[command.UserID]bool{},
		seenPictures: map[command.PictureID]bool{},
		notices:      []string{},
	}
	expectedUsers := map[command.UserID]bool{}
	for _, id := range body.MentionUserIDs {
		if id.UUID == [16]byte{} || expectedUsers[id] {
			return empty, invalidBody("body.mentionUserIds", "Mention IDs must be unique and nonzero.")
		}
		expectedUsers[id] = true
	}
	expectedPictures := map[command.PictureID]bool{}
	for _, id := range body.PictureIDs {
		if id.UUID == [16]byte{} || expectedPictures[id] {
			return empty, invalidBody("body.pictureIds", "Picture IDs must be unique and nonzero.")
		}
		expectedPictures[id] = true
	}
	expectedFiles := map[command.AssetID]bool{}
	if len(body.AttachmentIDs) > 20 {
		return empty, invalidBody("body.attachmentIds", "Use at most twenty file references.")
	}
	for _, id := range body.AttachmentIDs {
		if id.UUID == ([16]byte{}) || expectedFiles[id] {
			return empty, invalidBody("body.attachmentIds", "File IDs must be distinct and nonzero.")
		}
		expectedFiles[id] = true
	}
	root := element("div")
	nodes, err := html.ParseFragment(strings.NewReader(body.HTML), root)
	if err != nil {
		return empty, invalidBody("body.html", "Comment HTML could not be parsed.")
	}
	for _, n := range nodes {
		if err := c.append(root, n); err != nil {
			return empty, err
		}
	}
	if len(c.seenUsers) != len(expectedUsers) || len(c.seenPictures) != len(expectedPictures) {
		return empty, invalidBody("body", "The formatted references must match the explicit ID collections.")
	}
	for id := range c.seenUsers {
		if !expectedUsers[id] {
			return empty, invalidBody("body.mentionUserIds", "The selected mentions do not match the formatted references.")
		}
	}
	for id := range c.seenPictures {
		if !expectedPictures[id] {
			return empty, invalidBody("body.pictureIds", "The selected pictures do not match the formatted references.")
		}
	}
	if len(c.seenFiles) != len(expectedFiles) {
		return empty, invalidBody("body.attachmentIds", "The formatted files must match the selected IDs.")
	}
	for id := range c.seenFiles {
		if !expectedFiles[id] {
			return empty, invalidBody("body.attachmentIds", "The selected files do not match the references.")
		}
	}
	var encoded bytes.Buffer
	var text strings.Builder
	visible := 0
	for n := root.FirstChild; n != nil; n = n.NextSibling {
		if err := html.Render(&encoded, n); err != nil {
			return empty, err
		}
		plain(n, &text, &visible)
	}
	if encoded.Len() > 65536 || visible > 5000 {
		return empty, invalidBody("body.html", "Use at most 64 KiB of formatted HTML and 5,000 visible characters.")
	}
	value := strings.TrimSpace(text.String())
	if value == "" && c.imageCount == 0 {
		return empty, invalidBody("body.html", "Add text or a valid uploaded picture before saving.")
	}
	if utf8.RuneCountInString(value) > 10000 {
		return empty, invalidBody("body.html", "The derived comment text is too long.")
	}
	return CanonicalBody{encoded.String(), value, c.notices}, nil
}
