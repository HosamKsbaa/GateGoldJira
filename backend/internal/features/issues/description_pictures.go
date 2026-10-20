package issues

import (
	"context"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"strings"
)

func descriptionPictureIDs(fields IssueEditable) []command.PictureID {
	ids := []command.PictureID{}
	if fields.DescriptionFormat != command.HTMLDescription {
		return ids
	}
	root := &html.Node{Type: html.ElementNode, Data: "div", DataAtom: atom.Div}
	nodes, _ := html.ParseFragment(strings.NewReader(fields.Description), root)
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Data == "img" {
			for _, a := range node.Attr {
				if a.Key == "data-picture-id" {
					id, err := command.ParseID[command.PictureKind](a.Val)
					if err == nil {
						ids = append(ids, id)
					}
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	for _, node := range nodes {
		walk(node)
	}
	return ids
}
func validateNewDescription(fields IssueEditable) error {
	if len(descriptionPictureIDs(fields)) > 0 || (fields.DescriptionFormat == command.HTMLDescription && len(attachments.FileReferences(fields.Description, command.IssueID{})) > 0) {
		return validation("description", "Save the issue first, then paste or upload private pictures or files into its description.")
	}
	return nil
}
func validateDescriptionPictures(ctx context.Context, m *command.Mutation, issue command.IssueID, fields IssueEditable) error {
	for _, id := range descriptionPictureIDs(fields) {
		row, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: id.UUID, CallerID: m.Actor.UserID.UUID})
		if err != nil || row.IssueID != issue.UUID || row.Kind != "image" || row.State != "published" {
			return validation("description", "Use published private pictures belonging to this issue. Your description has not been changed.")
		}
	}
	if fields.DescriptionFormat == command.HTMLDescription {
		for _, id := range attachments.FileReferences(fields.Description, issue) {
			asset, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: id.UUID, CallerID: m.Actor.UserID.UUID})
			if err != nil || asset.IssueID != issue.UUID || asset.Kind != "file" || asset.State != "published" {
				return validation("description", "Use published files belonging to this issue.")
			}
		}
	}
	return nil
}

func (s *Service) prepareDescriptionAssets(ctx context.Context, actor command.Actor, issue command.IssueID, fields IssueEditable) (attachments.PreparedAssets, error) {
	if s.assets == nil || fields.DescriptionFormat != command.HTMLDescription {
		return attachments.PreparedAssets{}, nil
	}
	ids := attachments.FileReferences(fields.Description, issue)
	for _, id := range descriptionPictureIDs(fields) {
		ids = append(ids, command.AssetID{UUID: id.UUID})
	}
	distinct := map[command.AssetID]bool{}
	unique := []command.AssetID{}
	for _, id := range ids {
		if !distinct[id] {
			distinct[id] = true
			unique = append(unique, id)
		}
	}
	return s.assets.PrepareAssets(ctx, actor, issue, unique)
}
func (s *Service) commitDescriptionAssets(ctx context.Context, m *command.Mutation, issue command.IssueID, prepared attachments.PreparedAssets) ([]activity.FieldChange, error) {
	if s.assets == nil {
		return []activity.FieldChange{}, nil
	}
	return s.assets.CommitDescriptionAssets(ctx, m, issue, prepared)
}
