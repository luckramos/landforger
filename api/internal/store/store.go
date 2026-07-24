// Package store owns the Postgres connection pool and generated queries.
package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store is the application's Postgres connection pool.
type Store struct {
	Pool *pgxpool.Pool
}

// Open connects to Postgres and verifies the connection before returning.
func Open(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create Postgres pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping Postgres: %w", err)
	}

	return &Store{Pool: pool}, nil
}

// Close releases all connections in the pool.
func (s *Store) Close() {
	s.Pool.Close()
}
