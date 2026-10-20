package command

type StageRetirement struct {
	Status      Status `json:"status"`
	Replacement Status `json:"replacement"`
}

type WorkflowColumn struct {
	WarningLimit   *int32   `json:"warningLimit,omitempty" minimum:"0" maximum:"1000"`
	Status         Status   `json:"status"`
	Name           string   `json:"name" minLength:"1" maxLength:"60"`
	AllowedTargets []Status `json:"allowedTargets" nullable:"false" uniqueItems:"true"`
}
type BoardWorkflow struct {
	Columns []WorkflowColumn `json:"columns" nullable:"false" minItems:"2"`
}
