# PROTOTYPE — answers issue #15's four acceptance questions, then dies.

Throwaway spike: `@tiptap/markdown` codec round-trip + triple-trigger suggestion
stack (`/`, `@`, `[[`) with the ADR-0001 `[[slug]]` wikilink dialect.

## Run

```
npm install
npm run check   # automated checks for Q1/Q3/Q4 + Q2 smoke; prints a verdict block
npm run dev     # interactive app for Q2 (triple triggers, undo, rename button)
```

## What's here

- `src/extensions.ts` — the 13 v1 blocks (no Table, no Code block), custom
  `Callout` (`:::callout {type="info"}`), `WikiLink` (Mention extended,
  markdown spec overridden to `[[slug]]` with a custom tokenizer), `SlashMenu`,
  and a `CodeFenceAsText` degradation guard.
- `src/codec.ts` — headless `MarkdownManager` (`parseMd`/`serializeMd`), GFM off.
- `fixtures/all13.md`, `fixtures/hostile.md` — round-trip and collision corpora.
- `checks/acceptance.test.ts` — one vitest file, structured per acceptance
  question, prints PASS/FAIL verdicts and the normalization diff.
- `checks/app-smoke.test.tsx` — extra: mounts the full App in happy-dom
  (chips render live titles; rename re-renders chips, MD pane unchanged).
  Run with `npx vitest run checks/app-smoke.test.tsx`.
- `src/App.tsx` — two-pane editor + live markdown, rename button (Q4 visual).

## Findings (spike outcome)

1. All four automatable acceptance checks PASS on tiptap 3.27.4.
2. `@tiptap/markdown` silently DROPS fenced code blocks on parse when
   `codeBlock` is disabled (unknown token without child tokens -> `null`).
   The codec ships a 10-line `CodeFenceAsText` guard; production codec must
   keep an equivalent per-token safety net.
3. The `:::` container dialect (Callout, Details) requires blank lines between
   nested markers: `createBlockMarkdownSpec`'s closer-scan regex
   (`^:::([\w-]*)(\s.*)?/gm` — `\s` eats the newline) merges a bare `:::`
   closer with a following `:::name` opener line. Compact hand-written nesting
   fails to parse (opener degrades to a paragraph). Serializer output is always
   in the blank-line form, so editor-written files are safe.
4. Serialized output has no trailing newline; hand-written files with one get
   a one-time normalization (plus blank-line insertion inside `:::` blocks).
