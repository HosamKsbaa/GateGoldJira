package performance

import (
	"context"
	"encoding/json"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"testing"
	"time"
)

// Plans use the actual generated query and its declared argument order. Dynamic
// reflection here is confined to a test diagnostic, never application data.
func captureBoardPlans(t *testing.T, pool *pgxpool.Pool, project, board, column uuid.UUID) {
	t.Helper()
	if os.Getenv("GATEGOLD_CAPTURE_BOARD_PLANS") != "1" {
		return
	}
	source, err := parser.ParseFile(token.NewFileSet(), "../../internal/platform/database/dbgen/layout_queries.sql.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	params := dbgen.BoardsUnrankedCardsParams{
		ProjectID:          project,
		BoardID:            board,
		ColumnID:           column,
		SavedQueryKind:     "empty",
		TemporaryQueryKind: "empty",
		PageSize:           26,
		Today:              pgtype.Date{Time: time.Now(), Valid: true},
		AfterCreated:       pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	value := reflect.ValueOf(&params).Elem()
	for i := range value.NumField() {
		field := value.Field(i)
		if field.Kind() == reflect.Slice {
			field.Set(reflect.MakeSlice(field.Type(), 0, 0))
		}
	}
	var query string
	arguments := []any{}
	ast.Inspect(source, func(node ast.Node) bool {
		if spec, ok := node.(*ast.ValueSpec); ok && len(spec.Names) == 1 && spec.Names[0].Name == "boardsUnrankedCards" {
			literal, ok := spec.Values[0].(*ast.BasicLit)
			if !ok {
				t.Fatal("query literal unavailable")
			}
			query, err = strconv.Unquote(literal.Value)
			if err != nil {
				t.Fatal(err)
			}
		}
		if fn, ok := node.(*ast.FuncDecl); ok && fn.Name.Name == "BoardsUnrankedCards" {
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				method, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || method.Sel.Name != "Query" {
					return true
				}
				for _, arg := range call.Args[2:] {
					field, ok := arg.(*ast.SelectorExpr)
					if !ok {
						t.Fatal("unexpected generated parameter expression")
					}
					v := value.FieldByName(field.Sel.Name)
					if !v.IsValid() {
						t.Fatal("unknown query parameter")
					}
					arguments = append(arguments, v.Interface())
				}
				return false
			})
			return false
		}
		return true
	})
	if query == "" || len(arguments) == 0 {
		t.Fatal("actual generated query missing")
	}
	plans := map[string]json.RawMessage{}
	for _, probe := range []struct {
		name, sql string
		args      []any
	}{
		{"actual-unranked-page", query, arguments},
		{
			"actual-unfiltered-count",
			`SELECT c.id,c.order_revision,coalesce((SELECT sum((SELECT count(*) FROM issue_records i WHERE i.project_id=mapping.project_id AND i.stage_id=mapping.stage_id AND NOT i.archived AND NOT i.backlog)) FROM board_column_stages mapping WHERE mapping.column_id=c.id),0)::integer AS saved_count FROM board_columns c WHERE c.board_id=$1 AND c.id=$2 ORDER BY c.position,c.id`,
			[]any{board, column},
		},
	} {
		var raw []byte
		if err = pool.QueryRow(context.Background(), "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+probe.sql, probe.args...).Scan(&raw); err != nil {
			t.Fatal(probe.name, err)
		}
		plans[probe.name] = raw
	}
	output := os.Getenv("GATEGOLD_PERFORMANCE_REPORT")
	if output == "" {
		t.Fatal("plan capture requires a report path")
	}
	output = filepath.Join(filepath.Dir(output), filepath.Base(output)+".plans.json")
	raw, err := json.MarshalIndent(plans, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(output, raw, 0600); err != nil {
		t.Fatal(err)
	}
}
