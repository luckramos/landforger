GO ?= go
DATABASE_URL ?= postgres://landforger:landforger@localhost:5432/landforger?sslmode=disable
PORT ?= 8080
APP_ENV ?= development

.PHONY: run test generate migrate

run:
	DATABASE_URL='$(DATABASE_URL)' PORT='$(PORT)' APP_ENV='$(APP_ENV)' $(GO) run ./cmd/server

test:
	TESTCONTAINERS_RYUK_DISABLED=true $(GO) test ./...

generate:
	mkdir -p internal/httpapi/gen internal/store/gen
	$(GO) run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.4.1 --config oapi-codegen.yaml ../openapi.yaml
	$(GO) run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.27.0 generate

migrate:
	DATABASE_URL='$(DATABASE_URL)' APP_ENV='$(APP_ENV)' $(GO) run ./cmd/migrate
