-- name: ReadContractFixture :one
SELECT id, title, status, due_date, revision FROM contract_fixture WHERE id = $1;
