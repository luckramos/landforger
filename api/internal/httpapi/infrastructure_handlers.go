package httpapi

import "net/http"

// GetHealthz confirms that the HTTP API is reachable.
func (Server) GetHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}
