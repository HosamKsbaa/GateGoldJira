package configuration

import "gategoldjira/backend/internal/platform/command"

type ProblemCode string

const (
	DifferentWorkflow     ProblemCode = "different_active_workflows"
	AssetIDCollision      ProblemCode = "asset_id_collision"
	StagingKeyCollision   ProblemCode = "staging_key_collision"
	PublishedKeyCollision ProblemCode = "published_key_collision"
	RetryCollision        ProblemCode = "upload_retry_collision"
)

type PreflightProblem struct {
	Code      ProblemCode `json:"code" enum:"different_active_workflows,asset_id_collision,staging_key_collision,published_key_collision,upload_retry_collision"`
	Reference string      `json:"reference"`
	Message   string      `json:"message"`
}

type PreflightResult struct {
	ProjectID    command.ProjectID  `json:"projectId"`
	LegacyBoards int32              `json:"legacyBoards"`
	Problems     []PreflightProblem `json:"problems" nullable:"false"`
	MoreProblems bool               `json:"moreProblems"`
	Ready        bool               `json:"ready"`
}
