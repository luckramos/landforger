// Package config loads API configuration from the environment.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
)

// Config contains the process configuration required to start the API.
type Config struct {
	DatabaseURL string
	Port        int
	AppEnv      string
}

// Load reads configuration from the environment.
func Load() (Config, error) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	parsedURL, err := url.Parse(databaseURL)
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return Config{}, fmt.Errorf("DATABASE_URL must be a valid connection URL")
	}

	port := 8080
	if value := os.Getenv("PORT"); value != "" {
		port, err = strconv.Atoi(value)
		if err != nil || port < 1 || port > 65535 {
			return Config{}, fmt.Errorf("PORT must be an integer between 1 and 65535")
		}
	}

	appEnv := os.Getenv("APP_ENV")
	if appEnv == "" {
		appEnv = "development"
	}

	return Config{DatabaseURL: databaseURL, Port: port, AppEnv: appEnv}, nil
}
