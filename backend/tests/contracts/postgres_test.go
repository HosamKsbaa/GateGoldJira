package contracts

import (
	"context"
	_ "embed"
	"strconv"
	"testing"

	"gategoldjira/backend/tests/contracts/fixturedb"
	"gategoldjira/backend/tests/testenv"
	"github.com/jackc/pgx/v5/pgtype"
)

//go:embed schema.sql
var fixtureSchema string

func TestGeneratedSQLPreservesDateNullRevisionAndUnicode(t *testing.T) {
	pool := testenv.Database(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, fixtureSchema); err != nil {
		t.Fatal(err)
	}
	value := Example()
	if _, err := pool.Exec(ctx, "INSERT INTO contract_fixture VALUES ($1, $2, $3, $4, $5)", value.ID, value.Title, value.Status, value.DueDate, value.Revision); err != nil {
		t.Fatal(err)
	}
	var id pgtype.UUID
	if err := id.Scan(value.ID); err != nil {
		t.Fatal(err)
	}
	query := fixturedb.New(pool)
	row, err := query.ReadContractFixture(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if row.Title != value.Title || row.Status != value.Status || strconv.FormatInt(row.Revision, 10) != value.Revision || !row.DueDate.Valid || row.DueDate.Time.Format("2006-01-02") != *value.DueDate {
		t.Fatal("generated SQL changed a boundary value")
	}
	if _, err := pool.Exec(ctx, "UPDATE contract_fixture SET due_date = NULL WHERE id = $1", value.ID); err != nil {
		t.Fatal(err)
	}
	row, err = query.ReadContractFixture(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if row.DueDate.Valid {
		t.Fatal("SQL NULL became a zero date")
	}
}
