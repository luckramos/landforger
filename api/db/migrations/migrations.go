// Package migrations embeds and applies the API schema migrations.
package migrations

import (
	"context"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed *.sql
var files embed.FS

// Up applies every pending embedded migration.
func Up(ctx context.Context, pool *pgxpool.Pool) error {
	goose.SetBaseFS(files)
	if err := goose.SetDialect(string(goose.DialectPostgres)); err != nil {
		return fmt.Errorf("configure goose dialect: %w", err)
	}

	database := stdlib.OpenDBFromPool(pool)
	defer database.Close()
	if err := goose.UpContext(ctx, database, "."); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}

	return nil
}
