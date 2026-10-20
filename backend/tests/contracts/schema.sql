CREATE TABLE contract_fixture (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('todo','in_progress','review','done')),
  due_date date,
  revision bigint NOT NULL CHECK (revision > 0)
);
