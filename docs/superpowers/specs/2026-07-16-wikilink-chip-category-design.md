# Wikilink chips with category identity

**Date:** 2026-07-16
**Status:** Approved (design), pending implementation plan
**Area:** Page text editor (Tiptap) — `WikiLinkChip`
**Related:** ADR 0002 (interaction chrome), ADR 0003 (typography), ADR 0004 (OKLCH color), `CONTEXT.md` (Wikilink, Ghost link)

## Problem

In the Page editor, an inline reference to another Page is a **Wikilink** rendered as a chip (`WikiLinkChip`, built on `@tiptap/extension-mention`, serialized as `[[slug]]`). The current chip is a hard "pill": solid `--panel-3` background, a full `--hairline` border, `--radius-pill` (999px), and a bronze-tinted **Unicode glyph** (`CATEGORY_ICON`) that is the same color for every category.

Two issues:

1. **Visual noise.** When a short passage contains several Wikilinks, the opaque bordered pills read as a row of boxes and distract from the prose.
2. **No category signal.** The chip does not convey which kind of Page it points to, even though every Page has a `category` and the project already ships per-category colors (`--cat-*`) and per-category Phosphor duotone icons (`categoryIcons`).

## Goal

Make chips integrate more seamlessly into the running text while giving each one a quiet category identity (icon + color), so a dense cluster of Wikilinks reads calmly and each chip still tells you what it links to.

## Decisions (locked)

- **Icon source:** the existing Phosphor **duotone** category icons (`categoryIcons` via `categoryMeta`) — the same icons the dashboard uses — not the Unicode glyphs.
- **Color:** per-category color from the `--cat-<category>` tokens.
- **Rest state:** subtle category tint that **intensifies on hover** (not a flat always-on box).
- **Scope now:** the inline chip **and** the hover preview card. The suggestion menu (`@` / `[[`) is out of scope and keeps the Unicode glyph for now.

## Design

### 1. Category icon (chip + preview)

`WikiLinkChip` stops rendering the `CATEGORY_ICON` Unicode glyph and instead renders the Phosphor duotone icon for `page.category`, obtained through `categoryMeta(page.category).icon` (from `src/screens/Dashboard/categoryMeta.ts`, backed by `categoryIcons` in `src/icons/index.tsx`).

The chip's wrapper element sets `--icon-secondary-color: var(--cat-<category>)` (inline style, driven by `page.category`) so the duotone icon's wash path picks up the category color automatically — the mechanism already wired in `src/icons/index.module.css`. It also carries a `data-category={page.category}` attribute so CSS can key the tint off the category without inline color plumbing for the background.

The **hover preview card** makes the same swap: the `.previewCategory` eyebrow renders the duotone icon (colored by category) in place of the glyph. The card already exposes `data-preview-category`; its icon/eyebrow now align with the chip.

`CATEGORY_ICON` (Unicode glyphs) is **kept** — the suggestion menu still uses it. Nothing is removed from `WikiLinkRegistry.ts`.

### 2. Rest state — subtle tint, no hard box

The `.chip` base is rewritten to read as a text highlight rather than a button:

- **Background:** a whisper of category tint, e.g. `color-mix(in oklab, var(--cat-<cat>) ~8%, transparent)`, selected per category via the `data-category` attribute (one rule per category, mirroring the existing bronze `color-mix` recipe). Falls back to transparent when no category is set.
- **Border:** removed (no hard `--hairline` outline). If a hairline edge proves necessary for legibility, it may be a very faint category-tinted `--hairline-soft`, but the default is borderless.
- **Radius:** `--radius-xs` (6px) instead of `--radius-pill` — inline-highlight feel, not a pill.
- **Icon:** colored by category (§1). **Text** inherits the paragraph color (`--text-hi`), so reading flow is preserved.
- **Layout:** keep `white-space: nowrap`; trim padding (approx. `0 4px`); keep `font-size` close to body per ADR 0003 (no off-scale value introduced).

### 3. Hover / focus — reveal the surface

On `:hover` and `:focus-visible`, the category tint intensifies (e.g. `~16%`), signaling the chip is navigable; the text may lift to the category color. Reuse the existing transition (`background … calc(var(--mo, 1) * 160ms)`), keep the `scale(0.96)` `:active` press. `:focus-visible` gets the standard focus-ring treatment required by ADR 0002. All motion collapses under `prefers-reduced-motion` (the module's existing guard is retained and extended to cover any new transitions).

### 4. Ghost state (unresolved slug)

Unchanged in intent: no category is known, so no icon and no category color. The ghost chip keeps its dashed border, `--text-faint`, mono font, and raw `[[slug]]` text. It only needs to coexist correctly with the rewritten `.chip` base (e.g. re-assert `background: transparent` and border style so the new base rules don't leak in).

## Files touched

- `src/editor/extensions/WikiLink.tsx` — render the Phosphor duotone icon (chip + preview) instead of the glyph; set `--icon-secondary-color` and `data-category` on the wrapper.
- `src/editor/extensions/WikiLink.module.css` — rewrite `.chip`, `.chip:hover`, `.categoryIcon`; add per-category tint rules keyed on `data-category`; align the preview eyebrow; keep `.ghost` behavior; extend the reduced-motion guard as needed.
- Editor tests (e.g. `src/editor/__tests__/PageScreen.test.tsx` and any WikiLink chip test) — update assertions that depend on the Unicode glyph markup or the old pill styling.
- `src/editor/WikiLinkRegistry.ts` — **no change** (`CATEGORY_ICON` retained for the suggestion menu).

## Out of scope

- The suggestion menu (`@` / `[[`) styling and its icons.
- Any change to Wikilink serialization, navigation, preview positioning/portaling, or the registry lookup.

## Testing

- Chip renders the correct duotone category icon per category, colored by `--cat-<category>`.
- Chip has no hard border and uses `--radius-xs` in the rest state; tint intensifies on hover/focus.
- Ghost chip (unresolved slug) still renders dashed, faint, mono, with raw `[[slug]]` and no icon.
- `prefers-reduced-motion` disables the transitions.
- `pnpm typecheck` and `pnpm test` pass; full-suite counts verified without agent worktrees present.
