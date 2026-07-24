package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/luckramos/landforger/api/internal/httpapi"
	"github.com/luckramos/landforger/api/internal/testkit"
)

func TestHealthz(t *testing.T) {
	database := testkit.NewPostgres(t)
	database.Reset(t)

	server := httptest.NewServer(httpapi.NewHandler())
	t.Cleanup(server.Close)

	response, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	t.Cleanup(func() { _ = response.Body.Close() })

	if response.StatusCode != http.StatusOK {
		t.Errorf("GET /healthz status = %d, want %d", response.StatusCode, http.StatusOK)
	}
}
