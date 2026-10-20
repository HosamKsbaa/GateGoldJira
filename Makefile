SHELL := /bin/bash
ROOT := $(CURDIR)
export PATH := $(ROOT)/.tools/go/bin:$(ROOT)/.tools/node-v24.21.0-linux-x64/bin:$(PATH)
export GOCACHE := $(ROOT)/.cache/go-build
export GOMODCACHE := $(ROOT)/.cache/go-mod
export GOPATH := $(ROOT)/.tools/gopath
export GOFLAGS := $(strip $(GOFLAGS) -trimpath)
STORAGE_GUARD := python3 "$(ROOT)/scripts/with-project-storage.py" --root "$(ROOT)"
GATEGOLD_WEB_PORT ?= 4201
TEST_DATABASE_URL ?= postgres://gategoldjira:local-development-only@127.0.0.1:54329/gategoldjira?sslmode=disable
export TEST_DATABASE_URL

.PHONY: build typecheck contracts check-generated test test-integration dev dev-api dev-web db-up db-migrate
build:
	cd backend && $(STORAGE_GUARD) --kind build -- go build ./cmd/gategoldjira
	cd frontend && $(STORAGE_GUARD) --kind build -- npm run build
	cd identity/auth0 && $(STORAGE_GUARD) --kind build -- npm run build
typecheck:
	cd frontend && npm run typecheck
	cd identity/auth0 && npm run typecheck
contracts:
	bash scripts/generate-contracts.sh
check-generated:
	bash scripts/check-generated.sh
test:
	cd backend && $(STORAGE_GUARD) --kind backend -- bash -c 'go test ./... && go vet ./...'
	cd frontend && $(STORAGE_GUARD) --kind frontend -- npm test
test-integration:
	cd backend && TEST_DATABASE_URL='$(TEST_DATABASE_URL)' REQUIRE_POSTGRES_TESTS=1 $(STORAGE_GUARD) --kind backend -- go test -count=1 ./...
dev-api:
	cd backend && set -a && source .env.local && set +a && $(STORAGE_GUARD) --kind development -- go run ./cmd/gategoldjira
dev:
	bash scripts/dev.sh
dev-web:
	cd frontend && PORT='$(GATEGOLD_WEB_PORT)' $(STORAGE_GUARD) --kind development -- npm start -- --host 127.0.0.1 --port '$(GATEGOLD_WEB_PORT)'
db-up:
	docker compose -f compose.dev.yaml up -d --wait postgres
db-migrate: export TEST_DATABASE_URL := $(TEST_DATABASE_URL)
db-migrate:
	@bash scripts/migrate-database.sh

.PHONY: setup-dev db-seed dev-tokens
setup-dev:
	test -f backend/.env.local || cp backend/.env.example backend/.env.local
	test -f frontend/public/config.local.json || cp frontend/public/config.example.json frontend/public/config.local.json
db-seed:
	cd backend && set -a && source .env.local && set +a && go run ./cmd/gategoldjira dev-init
dev-tokens:
	cd backend && set -a && source .env.local && set +a && go run ./cmd/gategoldjira dev-tokens

.PHONY: test-browser
test-browser:
	bash scripts/run-browser-tests.sh

.PHONY: test-parity
test-parity:
	cd backend && TEST_DATABASE_URL='$(TEST_DATABASE_URL)' REQUIRE_POSTGRES_TESTS=1 $(STORAGE_GUARD) --kind backend -- go test -race ./tests/parity ./tests/mcp ./tests/contracts

.PHONY: test-performance test-perf test-restore prepare-test-target prepare-backend-release
test-performance test-perf:
	mkdir -p .local/performance/tmp
	cd backend && TMPDIR='$(ROOT)/.local/performance/tmp' TEST_DATABASE_URL='$(TEST_DATABASE_URL)' REQUIRE_POSTGRES_TESTS=1 RUN_SCALE_TESTS=1 GATEGOLD_PERFORMANCE_REPORT='$(ROOT)/.local/performance/local.json' $(STORAGE_GUARD) --kind performance -- go test -count=1 -timeout=15m -v ./tests/performance
test-restore:
	cd backend && $(STORAGE_GUARD) --kind backend -- go test -count=1 -v ./tests/recovery
prepare-test-target:
	bash scripts/prepare-test-target.sh
prepare-backend-release:
	bash scripts/release-backend.sh

# Coverage is measured independently from uninstrumented performance acceptance.
.PHONY: test-coverage test-coverage-full test-backend-coverage
test-backend-coverage:
	bash scripts/run-backend-coverage.sh
test-coverage:
	bash scripts/run-complete-coverage.sh
# This is intentionally strict: unavailable providers, unresolved expectations,
# missing surfaces, flaky tests and any source metric below100 cannot pass.
test-coverage-full:
	GATEGOLD_REQUIRE_FULL_USE_CASE_COVERAGE=1 GATEGOLD_REQUIRE_FULL_SOURCE_COVERAGE=1 bash scripts/run-complete-coverage.sh

.PHONY: storage-plan storage-clean
storage-plan:
	python3 scripts/project-storage.py --root '$(ROOT)' plan
storage-clean:
	python3 scripts/project-storage.py --root '$(ROOT)' maintain
