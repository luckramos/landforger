package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/luckramos/landforger/api/db/migrations"
	"github.com/luckramos/landforger/api/internal/config"
	"github.com/luckramos/landforger/api/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("migration failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	configuration, err := config.Load()
	if err != nil {
		return err
	}

	database, err := store.Open(context.Background(), configuration.DatabaseURL)
	if err != nil {
		return err
	}
	defer database.Close()

	if err := migrations.Up(context.Background(), database.Pool); err != nil {
		return err
	}
	return nil
}
