# Typography standards (better-typography)

LandForger is a text-first tool, so type quality is core to how crafted it feels. Ratified by PRD #57, which applied the project's `better-typography` standards across the whole front-end. The rules below are the durable standard; apply them to any new or touched text surface. They add no motion — reduced-motion is unaffected.

## Rules

- **Inputs ≥ 16px on mobile, no viewport zoom.** Every text-bearing input/textarea renders at 16px by default and steps *down* only at wider/pointer viewports, in vanilla CSS (no `maximum-scale` hack). Pattern:

  ```css
  .input { font-size: 16px; }
  @media (min-width: 640px) { .input { font-size: 13px; } }
  ```

  Below 16px iOS Safari zooms and reflows on focus. Never ship an input that resolves below 16px on a phone.
- **Reading measure ~65–70 characters.** A Page body caps at a comfortable measure (not the old ~85–90ch), matching the summary column above it. Cap the reading column, don't just widen the font.
- **Display titles read tight.** Screen titles (Auth heading, "New Page", Worlds welcome, placeholder titles, the Dashboard hero) get a consistent line-height and a touch of negative tracking at display sizes; the hero must not gap between lines as it scales up.
- **Balanced wrapping, no orphans.** Headings use `text-wrap: balance`; longer descriptions use `text-wrap: pretty` so paragraphs don't strand a lone last word. Long Slugs / Wikilink titles / IDs in narrow columns wrap (`overflow-wrap`) instead of overflowing.
- **Real italics only.** Emphasis renders as a genuine italic axis or honestly plain upright — never a browser-faked slant. Load the italic axis and set `font-synthesis` to forbid faking.
- **One type scale.** Every text size comes from the `--text-*` scale in `src/styles/tokens.css`. No ad-hoc pixel values; collapse near-duplicate steps onto scale values. Preserve the `--text-display` convergence for screen titles.
- **`tabular-nums` on in-place counts.** Counts that update in place (Category/Era page counts, timeline order numbers) use tabular figures so the layout doesn't jitter.
- **Truncated text stays reachable.** An ellipsized breadcrumb or spotlight result keeps its full text in a `title` attribute.
- **Control chrome is non-selectable.** `user-select: none` on control labels and keyboard-hint chips, so dragging across app-like chrome doesn't select button text.
- **Platform rendering parity.** Ship the macOS/Firefox font-smoothing counterpart so text isn't artificially heavy off WebKit.

## Verification

The one behavioral seam is truncation reachability (assert the `title` attribute at the component-render seam). Everything else is CSS/asset-only, verified by `pnpm typecheck` + `pnpm build` + the full suite staying green — no computed-style assertions (happy-dom has no layout engine). The type-scale migration lands as its own commit so "suite stayed green" stays meaningful.
