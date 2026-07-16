# Interaction chrome polish rules (better-ui)

The `better-ui` design principles apply uniformly to every interactive control, not just the primary click targets they first landed on. Ratified by the polish pass in PRD #56, extending the earlier #41 (`:focus-visible` ring), #43 (type-scale/radius tokens), and #46 (press feedback) idioms into the long tail of controls and normalizing the deviations that had crept in. The rules below are the durable standard; apply them to any new or touched control.

## Rules

- **Hit target ≥ 40×40px on desktop.** The *visible* size may stay small, but the clickable target underneath must be at least 40×40px (expand via padding or a pseudo-element hit area, not by enlarging the glyph). Covers canvas swatches/tools, dashboard icon buttons, property steppers, graph/map zoom controls, editor toolbar, nav items, dock window controls, genre chips.
  - **Exception — Page-action pills (skinny rows).** The Page screen redesign intentionally makes the See-on-map / Connections / See-on-timeline pills skinny (`padding: 5px 11px`), sitting below the 40px floor. They keep the padding-bump-not-`::after` shape so the packed 8px-gap row still can't overlap; the reduced target is a deliberate density trade-off for this secondary action row, not an oversight.
- **Consistent press feedback.** Every tactile control squishes to `scale(0.96)` on press — never absent, never so deep it reads as rubbery. This is one shared idiom; do not invent per-component press scales.
- **State changes ease, never snap.** Toggling a category, activating a tool, hovering a button — animate the transition. A hard state swap reads as brittle. Icon swaps that represent a mode toggle (e.g. dock float/maximize) cross-fade between glyphs rather than hard-swapping.
- **Images carry a hairline edge.** Reader body images, the property lightbox, and Map imagery get a subtle outline so they sit cleanly on the dark surface instead of bleeding into it.
- **Nested surfaces use concentric radii.** A surface inside another surface has its corner radius derived from the parent's (parent radius minus the gap), so nested panels look precise. Covers the User Menu popover/items, canvas shape picker, graph scope toggle.
- **Every form gets the focus treatment.** No form is exempt from the app-wide `:focus-visible` field treatment (the New Page form was the gap that motivated this).
- **`will-change` is transient, never retained.** Promote a compositor layer only for the duration of an interaction (e.g. an active pan/zoom) and release it after; never hold a promoted layer permanently.

## Verification

CSS-only; happy-dom has no layout/paint engine and chrome-devtools is unavailable in this WSL environment, so visual confirmation is manual. The build gate is `pnpm typecheck` + `pnpm build` + the full `pnpm test` suite staying green. Reduced-motion must keep collapsing all of the above.
