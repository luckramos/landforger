# OpenAPI as the single shared frontend/backend contract

A single `openapi.yaml` at the repository root is the source of truth for the HTTP contract. The Go API generates its server interface from it (`oapi-codegen`), and the web frontend generates its TypeScript client and types from it — so one edit to the spec propagates to both sides, and a mismatch surfaces at build time rather than in production. This is the concrete payoff of the monorepo (0005): the contract and both of its consumers move in one atomic commit. The initial spec was derived by scanning the frontend's data-access seam (the `WorldRepository` interface and the maps/search/auth call sites), which already spoke in parsed domain objects, giving a near 1:1 REST mapping. Neither side hand-writes request/response types; both are generated equals from the language-neutral spec.

## Considered Options

- **Hand-written types on each side** — rejected: guarantees drift between the Go handlers and the TS caller the moment either changes; the whole point is to make divergence a compile error.
- **tRPC** — rejected: TypeScript-only, so a Go backend cannot share it. It solves this problem only for all-TS stacks.
- **GraphQL** — rejected: heavier than this CRUD surface needs. The repository interface already yields a clean REST shape, and GraphQL's schema/resolver machinery would be cost without a matching benefit here.
- **Generate TS types from Go structs** — rejected: inverts ownership, coupling the contract to Go's type system and one framework's tags. OpenAPI keeps the contract language-neutral with both sides as generated consumers.
