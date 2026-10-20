package issues

import (
	"gategoldjira/backend/internal/platform/httpapi"
	"net/http"
	"testing"
)

func TestSubtaskContractRoutes(t *testing.T) {
	api := httpapi.New(http.NewServeMux())
	RegisterHTTP(api, nil)
	route := api.OpenAPI().Paths["/api/v1/issues/{parentId}/subtasks"]
	if route == nil || route.Get == nil || route.Post == nil || route.Get.OperationID != "list_subtasks" || route.Post.OperationID != "create_subtask" {
		t.Fatal("both concrete subtask providers must be registered")
	}
}
