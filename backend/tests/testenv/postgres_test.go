package testenv

import (
	"context"
	"testing"
)

func TestDatabaseIsolation(t *testing.T) {
	one, two := Database(t), Database(t)
	ctx := context.Background()
	if _, err := one.Exec(ctx, "CREATE TABLE isolation_probe (value text)"); err != nil {
		t.Fatal(err)
	}
	var exists bool
	if err := two.QueryRow(ctx, "SELECT to_regclass('public.isolation_probe') IS NOT NULL").Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("integration databases share application tables")
	}
}
