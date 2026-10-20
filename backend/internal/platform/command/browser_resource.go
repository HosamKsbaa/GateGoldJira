package command

// BrowserResource describes a route for an already authorized result. Each
// owning feature supplies its own route; MCP supplies the configured app URL.
type BrowserTarget struct{ Path, Title string }
type BrowserResource interface{ BrowserResource() BrowserTarget }

func (saved Saved[T]) BrowserResource() BrowserTarget {
	if resource, ok := any(saved.Result).(BrowserResource); ok {
		return resource.BrowserResource()
	}
	return BrowserTarget{}
}
func (view IssueView) BrowserResource() BrowserTarget       { return view.Summary.BrowserResource() }
func (view ModernIssueView) BrowserResource() BrowserTarget { return view.Summary.BrowserResource() }
func (view IssueSummary) BrowserResource() BrowserTarget {
	return BrowserTarget{"/issues/" + view.ID.String(), view.Key + ": " + view.Title}
}
func (view ModernIssueSummary) BrowserResource() BrowserTarget {
	return BrowserTarget{"/issues/" + view.ID.String(), view.Key + ": " + view.Title}
}
func (view BoardSummary) BrowserResource() BrowserTarget {
	return BrowserTarget{"/boards/" + view.ID.String(), view.Name}
}
func (view BoardView) BrowserResource() BrowserTarget { return view.Board.BrowserResource() }
