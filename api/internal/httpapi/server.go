// Package httpapi adapts the generated HTTP contract to API services.
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/luckramos/landforger/api/internal/httpapi/gen"
)

// Server implements the generated API contract.
type Server struct{}

var _ gen.ServerInterface = Server{}

// NewHandler creates the API router.
func NewHandler() http.Handler {
	router := chi.NewRouter()
	return gen.HandlerFromMux(Server{}, router)
}
