---
title: Motion fidelity audit checklist
date: 2026-07-14
issue: https://github.com/luckramos/landforger/issues/29
catalog: animation-catalog.md
---

# Motion fidelity audit checklist

This is the implementation sign-off against the five per-screen tables in the animation catalog. “Verified” means the interaction is present at the catalogued public seam, uses the catalogued easing/timing or an explicitly approved PRD deviation, consumes `--mo` with multiply-is-slower semantics, and collapses under `prefers-reduced-motion`.

## System invariants

- [x] `motionScale` is persisted per user, constrained to 0.5–1.5, applied live to `--mo`, and higher values make motion slower.
- [x] Serif/sans Page-body preference is persisted per user and applied live through `--page-body-font`.
- [x] CSS durations and render-computed staggers use `calc(var(--mo, 1) * …)`; JS timers multiply by the same scale.
- [x] The universal reduced-motion rule covers Auth, Worlds, Dashboard, Maps, and UserMenu; JS/rAF paths independently short-circuit where necessary.
- [x] Dismissible popovers, modals, drawers, and docked windows retain a 140ms scaled exit fade (0ms reduced).
- [x] All eight dead prototype keyframes are absent: `lf-ring`, `lf-glowPulse`, `wf-drift`, `lw-shimmer`, `star-twinkle`, `arrow-draw`, `mp-bob`, `mp-tlOpen`.

## Auth — 16/16 verified

- [x] Ambient image drift; login/signup panel swap; field entrance stagger; validation shake.
- [x] Submit scrim, `lf-burst` equivalent, delayed content fade, spinner, and reduced-aware navigation timer.
- [x] Input focus; Forgot hover; password-eye hover; submit hover/press; remember toggle; footer CTA; anchor hover.

## Worlds — 11/11 verified

- [x] Greeting fade; create-card and World-card entrances with scaled 70ms stagger.
- [x] Create modal scrim/panel entrance and exit; genre/custom-color reveal.
- [x] Search focus, card hover, create-card hover, chips, template cards, and primary/cancel actions.

## UserMenu — 4/4 verified

- [x] Avatar hover/open ring and measured popover entrance.
- [x] Item hover and scaled 140ms exit fade, including reduced motion.
- [x] Settings expose live motion intensity and Page-body font controls.

## Dashboard — catalog verified

- [x] View swap; sidebar/focus transitions; home-card stagger; saving pulse; toolbar dock.
- [x] Page cover/tags/Properties/popovers; editor menus; Backlinks; hover preview; create flow.
- [x] Spotlight scrim/panel/result selection and exit; dockable-window entrance, geometry morph, minimize/restore, and exit.
- [x] Timeline node/member staggers, expand/collapse, focus pulse, reduced-aware scroll, and Era reorder.
- [x] Graph reveal cadence uses multiply-is-slower, reduced motion reveals immediately, physics writes refs rather than React commits, and drag/pan/zoom remain interruptible.
- [x] Reference Canvas picker/geometry settling and imperative laser trail collapse under reduced motion.

## Maps — 22/22 verified

- [x] Bounded pan/zoom and Pin counter-scale.
- [x] 600ms drill-down/up with measured origin and map easing.
- [x] Pin appearance, hover overshoot/label, selected pulse, and edit drag.
- [x] 520ms Era image crossfade with scaled cleanup timer and missing-image fallback.
- [x] Era rail dot/labels/tint and Active Era persistence.
- [x] Inspector, docked reader, Add Pin, placing banner, Settings, and Map Library/delete overlays enter and exit safely.
- [x] Page navigation plays the 620ms Maps burst and navigates at 640ms; reduced motion uses a 60ms handoff.
- [x] Era-linked settings, upload slots, hierarchy drill, breadcrumb return, and Map Library actions remain functional.

## Top-10 load-bearing animation sign-off

- [x] 1. Auth login/signup panel swap — retargetable CSS transform.
- [x] 2. Auth field stagger and validation shake — replayable and reduced-aware.
- [x] 3. Auth navigation burst — complete handoff into Worlds.
- [x] 4. Worlds card stagger and create-modal transition.
- [x] 5. Dashboard sidebar/focus/view choreography.
- [x] 6. Spotlight open, selection, navigation, and exit.
- [x] 7. Dockable-window geometry morph plus entrance/exit fade.
- [x] 8. Timeline focused occurrence scroll/pulse and reorder settling.
- [x] 9. Graph staged reveal/ref-only physics and Canvas ref-only laser trail.
- [x] 10. Maps drill/crossfade and navigation burst into a Page.

## Automated evidence

- Focused behavior tests cover settings persistence/live application, Auth, all Maps interactions including the burst, all major overlay owners, and the shared dockable window.
- Static motion tests guard the global reduced-motion contract, dead-keyframe absence, Page-body font seam, and catalogued timing/easing tokens.
- Final validation: `pnpm test`, `pnpm typecheck`, and `pnpm build`.
