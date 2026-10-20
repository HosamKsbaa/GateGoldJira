package comments

import "gategoldjira/backend/internal/platform/command"

func (view CommentView) BrowserResource() command.BrowserTarget {
	return command.BrowserTarget{Path: "/issues/" + view.IssueID.String() + "#comment-" + view.ID.String(), Title: "View comment"}
}
