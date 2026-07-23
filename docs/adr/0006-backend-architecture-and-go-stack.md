# Backend architecture: Go + Postgres (source of truth) + R2, on a chi/pgx/sqlc/goose stack

The backend is a Go HTTP API with **PostgreSQL as the application's source of truth** and **Cloudflare R2 for binary assets only**. Markdown stays the canonical page format that must outlive the app (see 0001), but page/world *text* lives in Postgres, not as loose `.md` objects in blob storage — because everything the frontend actually does (full-text search over bodies, the backlink/relationship graph, filtering by frontmatter/tag/category) needs a queryable store, and R2 can't query. The server owns MD ↔ domain-object (de)serialization; R2 holds only genuinely binary payloads — map charts, page covers, image properties, canvas image/pdf blobs — uploaded via presigned URLs so the client PUTs straight to R2 and the API never proxies bytes. Text in Postgres is a rounding error per user (a heavy world is single-digit MB of text); R2's zero egress makes it the cheap home for the large stuff. Multi-tenancy is enforced from day one: every row is scoped to an owning account, resolved server-side (see 0007) — the frontend types carry no `ownerId` today and must not be trusted for scope. Hosting is Railway (API + Postgres co-located, free internal networking, ~$5–10/mo Hobby) with the frontend on Cloudflare Pages (effectively free, unmetered bandwidth).

The Go stack, chosen for a Postgres-centric CRUD API that will lean on Postgres-specific features (tsvector, arrays, jsonb):

- **Router: `chi`** — stays `net/http`-native (`http.Handler` everywhere), tiny, mature middleware ecosystem, first-class oapi-codegen target.
- **Data access: `pgx` + `sqlc`** — hand-written SQL compiled into type-safe Go at build time, no ORM reflection or hidden queries; the handful of dynamic-filter queries (page list by category/tag) drop to raw `pgx`, which coexists fine with sqlc-generated code.
- **Migrations: `goose`** — Go-native, embeddable in the binary via `embed.FS` (one deploy artifact), owns the schema DDL that sqlc reads.
- **Codegen: `oapi-codegen`** — generates the server interface from `openapi.yaml` (see 0008); **logging: `slog`** (stdlib); **config: env vars**.

## Considered Options

- **Store Markdown files directly in R2 (the initial instinct)** — rejected: R2 has no query capability, so lists, search, filters and the wikilink graph would force downloading everything or maintaining a parallel Postgres index anyway — two sources of truth to keep in sync. Text-in-Postgres is both simpler and cheaper.
- **GORM (or another full ORM)** — rejected: reflection cost, magic behavior, N+1 traps, and real friction with the Postgres features we depend on (tsvector, array columns). We want the generated SQL to be exactly what we wrote.
- **`gin` / `echo`** — rejected: their non-idiomatic `Context` type fights stdlib middleware, and their binding/validation value is redundant with the OpenAPI-generated layer.
- **`golang-migrate` / `atlas`** — both fine; golang-migrate is CLI-centric with separate up/down files, atlas adds a declarative-diff model that's overkill for V1. `goose` is simpler and embeds cleanly.
- **SQLite + Litestream on a single VPS** — a legitimate ultra-cheap V1 path (one file, backed up to R2). Deferred because Postgres scales better on concurrency and the managed free tiers (Railway/Neon) make the cost saving marginal at our start size.
