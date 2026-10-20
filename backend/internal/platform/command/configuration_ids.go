package command

// Configuration identities are data-driven while keeping unrelated UUID kinds
// distinct in commands and generated contracts.
type WorkflowKind struct{}
type StageKind struct{}
type TransitionKind struct{}
type IssueTypeKind struct{}
type PriorityKind struct{}
type ColumnKind struct{}
type FieldKind struct{}
type FieldOptionKind struct{}

type WorkflowID = ID[WorkflowKind]
type StageID = ID[StageKind]
type TransitionID = ID[TransitionKind]
type IssueTypeID = ID[IssueTypeKind]
type PriorityID = ID[PriorityKind]
type ColumnID = ID[ColumnKind]
type FieldID = ID[FieldKind]
type FieldOptionID = ID[FieldOptionKind]

// Migration preserves completion state. Ordinary issue movement owns completion
// and reopen transitions, so configuration cannot bypass those business guards.
type StageMigrationTarget struct {
	WorkflowID WorkflowID
	StageID    StageID
	Status     Status
	Name       string
}
