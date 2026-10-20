package boards

import "gategoldjira/backend/internal/platform/command"

func (view LayoutView) BrowserResource() command.BrowserTarget {
	return command.BrowserTarget{Path: "/boards/" + view.Board.ID.String(), Title: view.Board.Name}
}
