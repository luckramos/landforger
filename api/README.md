# LandForger API

The Go API uses chi, pgx, sqlc, and embedded goose migrations. The root
[`openapi.yaml`](../openapi.yaml) generates the HTTP adapter; generated Go is
committed under `internal/**/gen` and must be regenerated rather than edited.

## Local development

From this directory, start Postgres with Podman Compose, then run the API:

```sh
podman compose up -d
make run
```

The API listens on `http://localhost:8080`; `GET /healthz` returns `200` when
the router is reachable. `DATABASE_URL` is required by the binary and defaults
in the Makefile to the local Compose database. `PORT` defaults to `8080` and
`APP_ENV` to `development`.

```sh
make generate # regenerate oapi-codegen and sqlc output
make migrate  # apply embedded migrations without serving HTTP
make test     # run the HTTP integration suite
```

The integration suite starts its own disposable Postgres through
testcontainers-go. When using rootless Podman, point Docker-compatible clients
at a Podman API socket first, for example:

```sh
podman system service --time=0 unix:///tmp/landforger-podman.sock &
DOCKER_HOST=unix:///tmp/landforger-podman.sock make test
```
