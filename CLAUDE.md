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

### Design rules

Ratified design standards — apply to any new or touched UI. Full rationale + scope in the linked ADRs.

- Interaction chrome (`docs/adr/0002`, PRD #56): hit targets ≥40×40px on desktop; press feedback `scale(0.96)`; state changes ease, never snap (mode-toggle icons cross-fade); images carry a hairline edge; nested surfaces use concentric radii; every form gets the `:focus-visible` treatment; `will-change` is transient, never retained.
- Typography (`docs/adr/0003`, PRD #57): inputs ≥16px on mobile, step *down* only at `min-width: 640px` (no viewport zoom); Page body measure ~65–70ch; display titles get tight line-height + negative tracking; `text-wrap: balance` (headings) / `pretty` (paragraphs); real italics only (no synthetic slant); every size from the `--text-*` scale; `tabular-nums` on in-place counts; control chrome is `user-select: none`.
- Color (`docs/adr/0004`, PRD #58): theme colors authored in OKLCH; use tokens not hand-rolled values (`--laser`, `--scrim`, `--danger`, `--bronze-hi`); `var(--token, <fallback>)` for theme tokens; the token test asserts contrast ratios, not literal color strings.
