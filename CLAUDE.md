# LandForger

Worldbuilding wiki front-end (React + tiptap, mocked data). Pages are Markdown files with YAML frontmatter — MD is the source of truth. Domain glossary: `CONTEXT.md` (use its terms in code and issues). Decisions: `docs/adr/`. Research assets: `docs/research/`.

## Package manager

**Use pnpm, never npm or yarn.** The lockfile is `pnpm-lock.yaml`.

- Install: `pnpm install`
- Add a dependency: `pnpm add <pkg>` / `pnpm add -D <pkg>`
- Run scripts: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm build`

## Commands

- `pnpm dev` — Vite dev server
- `pnpm test` — Vitest (happy-dom), full suite
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm build` — typecheck + production build

## Conventions

- Styling: vanilla CSS — global `src/styles/tokens.css` (design tokens; values come from `docs/research/design-inventory.md` §3 and `docs/research/animation-catalog.md` §1) + CSS Modules per component. No Tailwind, no CSS-in-JS.
- Motion: durations scale via `--mo` (multiply-is-slower), pattern `calc(var(--mo, 1) * <N>ms)`; every animation must collapse under `prefers-reduced-motion`. Motion (framer-motion) only for dock morphs, staggers, and overlay exit fades — physics/rAF loops are imperative hooks.
- The implementation backlog is GitHub issues #17–#30 (sub-issues of the PRD, issue #16), wired with native blocking — work only unblocked issues.
