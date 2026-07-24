package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/luckramos/landforger/api/db/migrations"
	"github.com/luckramos/landforger/api/internal/config"
	"github.com/luckramos/landforger/api/internal/httpapi"
	"github.com/luckramos/landforger/api/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	configuration, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, err := store.Open(ctx, configuration.DatabaseURL)
	if err != nil {
		return err
	}
	defer database.Close()

	if err := migrations.Up(ctx, database.Pool); err != nil {
		return err
	}

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", configuration.Port),
		Handler:           httpapi.NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("server shutdown failed", "error", err)
		}
	}()

	slog.Info("server starting", "port", configuration.Port, "environment", configuration.AppEnv)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("serve HTTP: %w", err)
	}
	return nil
}
