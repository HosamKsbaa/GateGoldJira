package contracts

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"gategoldjira/backend/internal/app"
)

type successContractDocument struct {
	Paths map[string]map[string]struct {
		OperationID string `json:"operationId"`
		Responses   map[string]struct {
			Content map[string]struct {
				Schema struct {
					Ref string `json:"$ref"`
				} `json:"schema"`
			} `json:"content"`
		} `json:"responses"`
	} `json:"paths"`
}

// Dynamic upserts and retained import/name reuse return different HTTP success
// statuses with the same typed saved result. Check both the live registration
// and the checked-in client contract so generation cannot leave either stale.
func TestDynamicHTTPSuccessStatusesMatchRegisteredAndGeneratedContracts(t *testing.T) {
	api, err := app.Contracts()
	if err != nil {
		t.Fatal(err)
	}
	registered, err := json.Marshal(api.OpenAPI())
	if err != nil {
		t.Fatal(err)
	}
	generated, err := os.ReadFile("../../api/openapi.json")
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		operation, method, path, result string
		statuses                        []string
	}{
		{"save_issue_type", "put", "/api/v2/projects/{projectId}/issue-types/{typeId}", "SavedTypeSaved", []string{"200", "201"}},
		{"save_priority", "put", "/api/v2/projects/{projectId}/priorities/{priorityId}", "SavedPrioritySaved", []string{"200", "201"}},
		{"save_field", "put", "/api/v2/projects/{projectId}/fields/{fieldId}", "SavedFieldSaved", []string{"200", "201"}},
		{"save_field_option", "put", "/api/v2/projects/{projectId}/fields/{fieldId}/options/{optionId}", "SavedFieldOptionSaved", []string{"200", "201"}},
		{"save_development_link", "put", "/api/v1/issues/{issueId}/development-links/{linkId}", "SavedDevelopmentLinkView", []string{"200", "201"}},
		{"save_automation_rule", "put", "/api/v1/projects/{projectId}/automation-rules/{ruleId}", "SavedAutomationRuleView", []string{"200", "201"}},
		{"create_issue", "post", "/api/v1/projects/{projectId}/issues", "SavedIssueView", []string{"200", "201"}},
		{"create_issue_v2", "post", "/api/v2/projects/{projectId}/issues", "SavedModernIssueView", []string{"200", "201"}},
		{"create_label", "post", "/api/v1/projects/{projectId}/labels", "SavedLabelView", []string{"200", "201"}},
		// Controls prevent a blanket policy from documenting unsupported statuses.
		{"save_workflow", "put", "/api/v2/projects/{projectId}/workflows/{workflowId}", "SavedWorkflowSaved", []string{"200"}},
		{"save_workflow_stage", "put", "/api/v2/projects/{projectId}/workflows/{workflowId}/stages/{stageId}", "SavedStageSaved", []string{"200"}},
		{"save_workflow_transition", "put", "/api/v2/projects/{projectId}/workflows/{workflowId}/transitions/{transitionId}", "SavedTransitionSaved", []string{"200"}},
		{"create_project", "post", "/api/v1/projects", "SavedProjectView", []string{"201"}},
		{"create_subtask", "post", "/api/v1/issues/{parentId}/subtasks", "SavedIssueView", []string{"201"}},
	}
	for label, encoded := range map[string][]byte{"registered": registered, "generated": generated} {
		t.Run(label, func(t *testing.T) {
			var document successContractDocument
			if err := json.Unmarshal(encoded, &document); err != nil {
				t.Fatal(err)
			}
			for _, tc := range cases {
				t.Run(tc.operation, func(t *testing.T) {
					op, exists := document.Paths[tc.path][tc.method]
					if !exists || op.OperationID != tc.operation {
						t.Fatalf("missing exact operation %s %s", tc.method, tc.path)
					}
					count := 0
					for status := range op.Responses {
						if strings.HasPrefix(status, "2") {
							count++
						}
					}
					if count != len(tc.statuses) {
						t.Errorf("documented %d success statuses; want exactly %v", count, tc.statuses)
					}
					for _, status := range tc.statuses {
						response, exists := op.Responses[status]
						if !exists {
							t.Errorf("missing legitimate HTTP %s success", status)
							continue
						}
						ref := response.Content["application/json"].Schema.Ref
						if ref != "#/components/schemas/"+tc.result {
							t.Errorf("HTTP %s schema %q; want saved result %s", status, ref, tc.result)
						}
					}
				})
			}
		})
	}
}
