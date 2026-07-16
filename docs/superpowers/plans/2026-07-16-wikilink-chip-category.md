# Wikilink Chip Category Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Wikilink chip a quiet per-category identity (Phosphor duotone icon + category color) and make it read as inline text rather than a bordered pill, so dense clusters of Wikilinks stop feeling distracting.

**Architecture:** The chip is a Tiptap React NodeView (`WikiLinkChip` in `src/editor/extensions/WikiLink.tsx`) styled by `WikiLink.module.css`. Task 1 changes the TSX to render the existing `categoryIcons` duotone icon (via `categoryMeta`) instead of a Unicode glyph, and to set the `--chip-cat` inline custom property (the same convention Relation chips already use). Task 2 rewrites the CSS so the rest state is a whisper of category tint with no hard border, intensifying on hover/focus.

**Tech Stack:** React, TypeScript, Tiptap v3 (`@tiptap/extension-mention`), vanilla CSS Modules, Vitest + happy-dom + @testing-library/react. Package manager: **pnpm only**.

## Global Constraints

- Package manager is **pnpm**, never npm/yarn.
- Styling is vanilla CSS: global tokens in `src/styles/tokens.css` + CSS Modules. No Tailwind, no CSS-in-JS.
- Motion durations use the pattern `calc(var(--mo, 1) * <N>ms)`; every transition must collapse under `prefers-reduced-motion`.
- Per-category color comes from the `--cat-<category>` tokens (ADR 0004). Use tokens, not hand-rolled colors. Use `var(--token, <fallback>)`.
- Category color on a chip is carried by the `--chip-cat` inline custom property set to `var(--cat-<category>)` — the established convention (`src/properties/PropertyInput.tsx:51`, `src/properties/Properties.module.css`).
- Duotone category icons come from `categoryIcons` in `src/icons/index.tsx`, consumed only through `categoryMeta(category)` in `src/screens/Dashboard/categoryMeta.ts` — never import `@phosphor-icons/react` or `categoryIcons` directly in the editor.
- Interaction chrome (ADR 0002): `scale(0.96)` press feedback and a `:focus-visible` treatment are required; keep them.
- `CATEGORY_ICON` (Unicode glyphs) in `src/editor/WikiLinkRegistry.ts` must NOT be removed — the suggestion menu still uses it. It is only removed from the chip and preview.
- Vitest note: the full suite globs agent worktrees under `.claude/worktrees/` and reports bogus counts. Run the specific test file during tasks; for the final full-suite run, ensure no `.claude/worktrees/` exist (or pass an exclude).

---

## File Structure

- `src/editor/extensions/WikiLink.tsx` — chip NodeView. Renders the duotone icon (chip + preview eyebrow), sets `--chip-cat`. **Modify.**
- `src/editor/extensions/WikiLink.module.css` — chip styling. Rest tint / hover / icon color / ghost / preview eyebrow. **Modify.**
- `src/editor/__tests__/PageEditor.test.tsx` — add a test for icon + `--chip-cat`; existing chip tests must stay green. **Modify.**
- `src/editor/WikiLinkRegistry.ts` — **no change** (`CATEGORY_ICON` retained).

---

## Task 1: Render duotone category icon + set `--chip-cat` (chip & preview)

**Files:**
- Modify: `src/editor/extensions/WikiLink.tsx` (imports; `WikiLinkChip` body, lines ~46–146)
- Test: `src/editor/__tests__/PageEditor.test.tsx`

**Interfaces:**
- Consumes: `categoryMeta(category: string): { category: Category; label: string; icon: ComponentType<IconProps> } | undefined` from `src/screens/Dashboard/categoryMeta.ts`. The icon component accepts a `size?: number` prop.
- Consumes: `page.category: Category` (already available on the registry lookup `options.registry.get(slug)`).
- Produces: resolved chips render an `<svg>` (duotone icon) inside `span.categoryIcon` and carry an inline custom property `--chip-cat: var(--cat-<category>)` on the chip wrapper and on the portaled preview card. Ghost chips render neither.

- [ ] **Step 1: Write the failing test**

Add this test to `src/editor/__tests__/PageEditor.test.tsx`, inside the `describe('PageEditor — 13 blocks render from a fixture body', …)` block (after the existing "wikilink chips render the LIVE title" test, ~line 83). `sera` resolves to a `characters` page; `ember-cycle` is intentionally unresolved (ghost).

```tsx
  it('resolved chips render the category icon and carry --chip-cat; ghosts carry neither', async () => {
    const { container } = await mountEditor()
    const sera = container.querySelector('[data-wikilink="sera"]') as HTMLElement
    // Duotone category icon renders as an <svg> inside the chip.
    expect(sera.querySelector('svg')).toBeTruthy()
    // Category color is carried via the --chip-cat convention (same as Relation chips).
    expect(sera.style.getPropertyValue('--chip-cat')).toContain('--cat-characters')

    const ghost = container.querySelector('[data-wikilink="ember-cycle"]') as HTMLElement
    expect(ghost.querySelector('svg')).toBeNull()
    expect(ghost.style.getPropertyValue('--chip-cat')).toBe('')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/editor/__tests__/PageEditor.test.tsx`
Expected: the new test FAILS — `sera.querySelector('svg')` is null (chip still renders the Unicode glyph) and `--chip-cat` is empty. Existing tests still pass.

- [ ] **Step 3: Add the `categoryMeta` import**

In `src/editor/extensions/WikiLink.tsx`, add near the existing imports (the file already imports from `../WikiLinkRegistry`; keep `CATEGORY_ICON` imported since the suggestion menu below still uses it):

```tsx
import { categoryMeta } from '../../screens/Dashboard/categoryMeta'
import type { CSSProperties } from 'react'
```

(If a `react` type import already exists, add `CSSProperties` to it rather than duplicating.)

- [ ] **Step 4: Compute the meta + chip-cat style, set `--chip-cat` on the wrapper, and render the icon**

In `WikiLinkChip`, after `const page = options.registry.get(slug)` (~line 55), add:

```tsx
  const meta = page ? categoryMeta(page.category) : undefined
  const chipCatStyle: CSSProperties | undefined = page
    ? ({ '--chip-cat': `var(--cat-${page.category})` } as CSSProperties)
    : undefined
```

On the `<NodeViewWrapper …>` (~line 95), add the style prop (keep all existing props):

```tsx
      style={chipCatStyle}
```

Replace the glyph span (current line 114):

```tsx
      {page && <span className={styles.categoryIcon} aria-hidden="true">{CATEGORY_ICON[page.category]}</span>}
```

with the duotone icon:

```tsx
      {meta && (
        <span className={styles.categoryIcon} aria-hidden="true">
          <meta.icon size={14} />
        </span>
      )}
```

- [ ] **Step 5: Swap the glyph for the icon in the preview eyebrow and carry `--chip-cat` on the portaled card**

The preview card is portaled to `<body>`, so it does NOT inherit `--chip-cat` from the chip wrapper — set it on the card too. On the preview `<span … className={styles.preview} …>` (~line 122), merge `--chip-cat` into its existing inline `style` object:

```tsx
          style={{
            left: preview.left,
            top: preview.top,
            visibility: preview.positioned ? 'visible' : 'hidden',
            '--chip-cat': `var(--cat-${page.category})`,
          } as CSSProperties}
```

Then replace the eyebrow (current line 133):

```tsx
          <span className={styles.previewCategory}>{CATEGORY_ICON[page.category]} {page.category}</span>
```

with:

```tsx
          <span className={styles.previewCategory}>
            {meta && <meta.icon size={13} />} {page.category}
          </span>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/editor/__tests__/PageEditor.test.tsx`
Expected: all tests in the file PASS, including the new one. (`textContent` assertions in existing tests are unaffected — an `<svg>` contributes no text.)

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/editor/extensions/WikiLink.tsx src/editor/__tests__/PageEditor.test.tsx
git commit -m "feat(editor): render duotone category icon + --chip-cat on Wikilink chips

Chip and hover preview now show the per-category Phosphor duotone icon
via categoryMeta and carry the category color through --chip-cat, matching
the Relation-chip convention. CATEGORY_ICON kept for the suggestion menu.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Restyle the chip — subtle category tint, no hard box, hover reveal

**Files:**
- Modify: `src/editor/extensions/WikiLink.module.css` (`.chip`, `.chip:hover`, `.categoryIcon`; add `.chip:focus-visible`; adjust `.previewCategory`; keep `.ghost` correct)

**Interfaces:**
- Consumes: the `--chip-cat` inline custom property set in Task 1 (unset on ghost chips → tint resolves to transparent).
- Produces: no code interface. Visual/behavioral deliverable verified by typecheck + the full suite staying green (computed CSS is not unit-testable under happy-dom, matching how Relation-chip styling is verified).

- [ ] **Step 1: Rewrite `.chip`, `.chip:hover`, add `.chip:focus-visible`, and recolor `.categoryIcon`**

In `src/editor/extensions/WikiLink.module.css`, replace the current `.chip` (lines 5–22), `.chip:hover` (24–27), and `.categoryIcon` (33–38) blocks with:

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--radius-xs);
  /* Rest: a whisper of the target's Category color. Transparent for ghosts
     (no --chip-cat set). Mirrors the Relation-chip color-mix recipe. */
  background: color-mix(in oklab, var(--chip-cat, transparent) 8%, transparent);
  color: var(--text-hi);
  font-size: 0.94em;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background calc(var(--mo, 1) * 160ms),
    color calc(var(--mo, 1) * 160ms),
    box-shadow calc(var(--mo, 1) * 160ms),
    transform calc(var(--mo, 1) * 120ms) var(--ease-house);
}

/* Hover/focus reveal: the tint intensifies and the text lifts to the
   Category color, signaling the chip is navigable. */
.chip:hover,
.chip:focus-visible {
  background: color-mix(in oklab, var(--chip-cat, var(--bronze)) 16%, transparent);
  color: var(--chip-cat, var(--bronze-light));
}

.chip:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--chip-cat, var(--bronze)) 60%, transparent);
  outline-offset: 1px;
}

.chip:active {
  transform: scale(0.96);
}

/* The duotone category icon. Both its outline (currentColor) and its wash
   (--icon-secondary-color, which falls back to currentColor) take the
   Category color — matching the dashboard's `color: var(--cat-*)` pattern. */
.categoryIcon {
  display: inline-flex;
  color: var(--chip-cat, var(--bronze-light));
}
```

Note: `.chip:active` already existed; if the replacement above duplicates it, keep a single `.chip:active` block. The `gap` replaces the old `margin-right` on `.categoryIcon`.

- [ ] **Step 2: Color the preview eyebrow icon by category**

The `.previewCategory` block (lines 59–65) currently forces bronze text. Keep the uppercase mono eyebrow, but let the icon carry the category color and align it with the label. Replace the `.previewCategory` block with:

```css
.previewCategory {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--bronze);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.previewCategory svg {
  color: var(--chip-cat, var(--bronze-light));
}
```

- [ ] **Step 3: Keep the ghost chip correct against the new base**

The `.ghost` block (lines ~108–114) must still read as a dashed, faint, mono `[[slug]]` with no tint. Since the new `.chip` base has `border: 0` and a tinted background, re-assert the ghost's border and transparent background. Replace the `.ghost` block with:

```css
/* Ghost link — the target Slug no longer resolves (CONTEXT.md — "Ghost link").
   No Category is known, so no tint and no icon. */
.ghost {
  padding: 0 3px;
  border: 1px dashed var(--hairline);
  background: transparent;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 0.85em;
}

.ghost:hover,
.ghost:focus-visible {
  background: transparent;
  color: var(--text-faint);
}
```

- [ ] **Step 4: Confirm the reduced-motion guard still covers the chip**

The existing guard (lines ~116–124) sets `.chip { transition-duration: 0ms }` and `.preview { animation-duration: 0ms }`. The rewritten `.chip` still uses a single `transition` shorthand, so `transition-duration: 0ms` overrides it. No change needed — just verify the block is still present after your edits.

- [ ] **Step 5: Typecheck and run the editor tests**

Run: `pnpm typecheck && pnpm test src/editor/__tests__/PageEditor.test.tsx`
Expected: no type errors; all editor chip tests PASS (Task 1's icon/`--chip-cat` test and the existing title/ghost/preview tests).

- [ ] **Step 6: Run the full suite (no worktrees present)**

First confirm no agent worktrees skew the count:

Run: `ls .claude/worktrees 2>/dev/null && echo "WORKTREES PRESENT — clean up or exclude before trusting counts" || echo "clean"`

Then:

Run: `pnpm test`
Expected: full suite green; no regressions in `PageScreen.test.tsx`, `PageEditor.test.tsx`, `codec.test.ts`, or `motion.test.tsx`.

- [ ] **Step 7: Visual verification**

Chrome DevTools MCP is broken under WSL (verify via typecheck/test/build, not screenshots). Instead, run the dev server and confirm by eye in a normal browser: `pnpm dev`, open a Page with several Wikilinks in one paragraph. Confirm: chips read as softly tinted inline text (no hard boxes); each shows its category's duotone icon in the category color; hovering intensifies the tint and lifts the text color; keyboard focus shows the outline ring; a ghost link stays dashed and faint. (If running headless, at minimum `pnpm build` must pass.)

- [ ] **Step 8: Commit**

```bash
git add src/editor/extensions/WikiLink.module.css
git commit -m "feat(editor): soften Wikilink chips to inline category tint

Rest state is a whisper of the Category color with no hard border and a
small radius, reading as inline text; hover/focus intensify the tint and
lift the text to the Category color. Icon and preview eyebrow take the
Category color via --chip-cat. Ghost chips unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 (duotone icon, chip + preview, `--chip-cat`, `CATEGORY_ICON` kept) → Task 1. ✓
- Spec §2 (subtle tint, borderless, `--radius-xs`, icon colored, text inherits, nowrap) → Task 2 Step 1. ✓
- Spec §3 (hover intensify, `:focus-visible`, `scale(0.96)`, reduced-motion) → Task 2 Steps 1 & 4. ✓
- Spec §4 (ghost unchanged, coexists with new base) → Task 2 Step 3. ✓
- Spec "Files touched" and "Out of scope" (registry untouched, suggestion menu untouched) → File Structure + Global Constraints. ✓
- Spec "Testing" bullets → Task 1 Steps 1/6, Task 2 Steps 5/6/7. ✓

**Placeholder scan:** No TBD/TODO; every code step shows the actual code; commands have expected output. ✓

**Type consistency:** `categoryMeta` returns `{ category, label, icon }`; `meta.icon` is a `ComponentType<IconProps>` accepting `size` — used as `<meta.icon size={14} />` / `size={13}`. `--chip-cat` set identically (`var(--cat-${page.category})`) on wrapper (Task 1 Step 4) and preview card (Task 1 Step 5), and consumed identically in CSS (Task 2). `CSSProperties` imported in Task 1 Step 3 and used in both style objects. ✓
