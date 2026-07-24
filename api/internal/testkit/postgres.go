// Package testkit provides integration-test infrastructure for the API.
package testkit

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/luckramos/landforger/api/db/migrations"
	"github.com/luckramos/landforger/api/internal/store"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// Postgres is a migrated, disposable Postgres database for one test package.
type Postgres struct {
	container testcontainers.Container
	store     *store.Store
}

// NewPostgres starts a disposable, migrated Postgres instance.
func NewPostgres(t *testing.T) *Postgres {
	t.Helper()

	ctx := context.Background()
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image: "registry-1.docker.io/library/postgres:16-alpine",
			Env: map[string]string{
				"POSTGRES_DB":       "landforger",
				"POSTGRES_PASSWORD": "landforger",
				"POSTGRES_USER":     "landforger",
			},
			ExposedPorts: []string{"5432/tcp"},
			WaitingFor:   wait.ForListeningPort("5432/tcp"),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start Postgres container: %v", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("get Postgres host: %v", err)
	}
	port, err := container.MappedPort(ctx, "5432/tcp")
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("get Postgres port: %v", err)
	}

	database, err := store.Open(ctx, fmt.Sprintf("postgres://landforger:landforger@%s:%s/landforger?sslmode=disable", host, port.Port()))
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("connect to Postgres: %v", err)
	}
	if err := migrations.Up(ctx, database.Pool); err != nil {
		database.Close()
		_ = container.Terminate(ctx)
		t.Fatalf("migrate Postgres: %v", err)
	}

	postgres := &Postgres{container: container, store: database}
	t.Cleanup(func() {
		postgres.store.Close()
		if err := postgres.container.Terminate(context.Background()); err != nil {
			t.Errorf("terminate Postgres container: %v", err)
		}
	})
	return postgres
}

// Reset removes application data between HTTP tests while preserving migrations.
func (p *Postgres) Reset(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	rows, err := p.store.Pool.Query(ctx, `
SELECT quote_ident(table_schema) || '.' || quote_ident(table_name)
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name <> 'goose_db_version'
	ORDER BY table_name`)
	if err != nil {
		t.Fatalf("list tables to reset: %v", err)
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			t.Fatalf("read table to reset: %v", err)
		}
		tables = append(tables, table)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("list tables to reset: %v", err)
	}
	if len(tables) == 0 {
		return
	}
	if _, err := p.store.Pool.Exec(ctx, "TRUNCATE TABLE "+strings.Join(tables, ", ")+" RESTART IDENTITY CASCADE"); err != nil {
		t.Fatalf("truncate tables: %v", err)
	}
}
