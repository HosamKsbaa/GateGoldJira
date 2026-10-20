package projects

import "gategoldjira/backend/internal/platform/command"

func (view ProjectView) BrowserResource() command.BrowserTarget {
	return command.BrowserTarget{Path: "/projects/" + view.ID.String(), Title: view.Key + ": " + view.Name}
}
