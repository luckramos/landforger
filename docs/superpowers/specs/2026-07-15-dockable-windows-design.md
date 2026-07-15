# Dockable windows: page-like entry, persisted mode, navigation survival

Date: 2026-07-15
Status: approved, pending implementation

## Problem

Three defects in the dockable panels (Timeline, Relationship Graph, Reference Canvas), all rooted in the same two decisions: dock state lives in component-local `useState`, and which panel is open lives in a single URL query param.

### 1. Full-page panels expand out of the sidebar

`.window` is `position: fixed` with no `left/top/width/height` in CSS (`DockableWindow.module.css:1`). The Motion `initial` prop sets only `opacity` (`DockableWindow.tsx:164`), so Motion resolves the starting geometry by reading the DOM — which gives the element's *static* position inside the shell grid, immediately right of the sidebar, at content-derived width. It then animates `left/top/width/height` to fullscreen. The sidebar expansion is not a designed effect; it is uninitialized geometry.

### 2. A docked window closes on navigation

Open-panel state lives in the `?panel=` query param (`DashboardShell.tsx:31`). Every sidebar `Link` navigates without preserving the query string, and `GraphPanel`'s `onNavigatePage` explicitly drops it (`DashboardShell.tsx:247`). The panel unmounts, taking `mode`, `minimized` and the `floating` geometry — all component-local `useState` (`DockableWindow.tsx:86-88`) — with it.

### 3. Only one panel can be open

`?panel=` holds a single value by construction.

## Decisions

| Decision | Choice |
| --- | --- |
| Source of truth | A `dockStore`. `?panel=` survives as a deep-link *entry point* only: consumed and stripped on load. |
| Persistence | `mode` + `geometry` per panel, per user, in `localStorage`. Open/closed does **not** persist — a reload starts with no windows open. |
| Scope of the preference | Global per user, not per World. "I like the graph floating" is a habit, not a property of a world. |
| Multiple windows + full-page | Free z-order, click-to-front. Full-page is just a window that fills the viewport; two full-page windows stack, both stay open. |
| Floating entry motion | Pop in place: `scale .96 → 1` + fade, 200ms, `--ease-house`, origin at the window's own centre. |
| Full-page entry motion | Reuse the established page transition `lw-view-in` (`DashboardShell.module.css:86`): fade + `translateY(10px)` + `scale(.994)`, 300ms, `--ease-house`. |

## Architecture

### `src/state/dockStore.ts` (new)

Mirrors `uiStore`: a `setDockStorage` test seam, per-user keying, normalize/clamp on read, writes that tolerate unavailable storage.

```ts
export type DockPanelId = 'timeline' | 'graph' | 'canvas'
export interface DockGeometry { x: number; y: number; width: number; height: number }

/** Persisted to localStorage under 'landforger:dock:v1', keyed by user id. */
export interface DockPanelPrefs {
  mode: 'fullscreen' | 'floating'
  geometry: DockGeometry
}

/** Runtime state; only the DockPanelPrefs half reaches storage. */
interface DockPanelState extends DockPanelPrefs {
  open: boolean
  minimized: boolean
}
```

Store shape: `panels: Record<DockPanelId, DockPanelState>`, plus `zOrder: DockPanelId[]`.

Actions: `open(id)`, `close(id)`, `setMode(id, mode)`, `setMinimized(id, minimized)`, `setGeometry(id, geometry)`, `focus(id)`, `activateUser(email)`.

`zIndex` is derived as `70 + zOrder.indexOf(id)` rather than stored as a counter, so it stays bounded and cannot drift.

Geometry is clamped through the existing `clampGeometry` on read from storage and on window resize, so a viewport change between sessions can never restore an off-screen window.

### `DockableWindow` becomes store-connected

Drops the `mode` / `minimized` / `floating` `useState` and takes a `panelId`, reading and writing the store. The component already imports `uiStore` for `motionScale`, so this follows existing precedent rather than setting one.

`initialState` becomes `defaultMode` — the fallback used only when nothing is persisted for that panel.

`useImperativeHandle` and the `DockableWindowHandle` type are deleted. `TimelinePanel`'s `windowRef.current?.dock()` (`TimelinePanel.tsx:47`) becomes `setMode('timeline', 'floating')`. The intent behind that call — dock before navigating so the reader watches their chosen Page load instead of losing it behind a fullscreen panel — is preserved exactly.

### The entry fix

`initial` carries the **full** geometry, and the entry animation is transform-only:

- full-page: `initial={{ ...geometry, opacity: 0, y: 10, scale: .994 }}`
- floating: `initial={{ ...geometry, opacity: 0, scale: .96 }}`

Because `left/top/width/height` already hold their final values in `initial`, the geometry delta at mount is zero. The morph becomes arithmetically impossible rather than merely unlikely.

No "has mounted" flag is needed. Motion accepts per-property transitions: `opacity`/`y`/`scale` get the entry duration (300ms full-page, 200ms floating), while the geometry keys keep the existing 340ms house morph. At mount the 340ms runs across a zero delta and is invisible; afterwards, the header's full-page↔floating toggle morphs as it does today. `exit` carries `overlayExitTransition` on its own variant so it does not contend with the entry opacity.

Entry transforms are composited and cheap; the morph stays on layout properties. Both collapse under `prefers-reduced-motion` via the existing `reduced` check.

### `DockLayer` (new) and navigation survival

The three `panel === '…'` conditionals leave `DashboardShell` for a `<DockLayer />` driven by the store. It renders outside `.view` — the only element keyed by `location.pathname` (`DashboardShell.tsx:224`) — so it never unmounts on navigation. State lives in the store regardless, so even a remount would not lose it.

- Sidebar `Link to={?panel=…}` entries (`DashboardShell.tsx:192-194`) become buttons calling `open(id)`.
- A shell effect reads `?panel=` on entry, opens that panel, and strips the param.
- `GraphPanel`'s `onNavigatePage` becomes a plain `navigate(/w/${world.slug}/p/${slug})`; the window simply stays open. The query-string juggling disappears from all three panels.
- Pointerdown anywhere in a window moves its id to the end of `zOrder`.

**No shifting**: geometry lives in the store and the panel stays mounted, so nothing re-initialises. `defaultFloatingGeometry()` stops running on every mount and becomes the no-persisted-state fallback. `position: fixed` means page reflow behind the window cannot move it.

## Testing

Test files live in `src/__tests__/` (there is no `src/state/__tests__/`); `dockStore` tests join them as `dock.test.tsx`.

**Test isolation is the main hazard.** `dockStore` is a module-level store, and `graph.test.tsx`, `timeline.test.tsx` and `canvas.test.tsx` mount real panels across ~20 call sites. Without a reset, a test that floats the graph leaks its persisted mode into the next one. Every suite that mounts a panel gets `setDockStorage(createInMemoryStorage())` + `resetDockStore()` in `beforeEach` and `setDockStorage(null)` in `afterEach` — the pattern `userMenu.test.tsx:12-22` already uses for `setUiStorage`.

Conversely, the existing `renderAt('/w/ninth-vale?panel=…')` call sites **keep passing unchanged**, because `?panel=` survives as a deep-link entry point. The `?panel=` assertions need no rewrite; only isolation setup is added.

New — `src/__tests__/dock.test.tsx`:
- persists `mode` + `geometry` per user; restores them on `activateUser`
- does **not** persist open/minimized; a fresh store starts closed
- clamps restored geometry against the current viewport
- `focus(id)` reorders `zOrder`; `zIndex` derivation stays bounded
- survives unavailable/corrupt storage without throwing

New — component level:
- a full-page panel mounts with `initial` geometry equal to `animate` geometry (the regression test for the sidebar expansion)
- a floating panel mounts at its persisted geometry
- navigating with a docked window open leaves it mounted with identical geometry
- two panels open simultaneously
- clicking a background window brings it to front

Updated — isolation setup only: `graph.test.tsx`, `timeline.test.tsx`, `canvas.test.tsx`, `routes.test.tsx`.

## Files

| File | Change |
| --- | --- |
| `src/state/dockStore.ts` | new |
| `src/__tests__/dock.test.tsx` | new |
| `src/components/DockableWindow/DockLayer.tsx` | new |
| `src/components/DockableWindow/DockableWindow.tsx` | store-connected; entry fix; focus on pointerdown; drop `useImperativeHandle` |
| `src/screens/Dashboard/DashboardShell.tsx` | drop `?panel=` conditionals; mount `DockLayer`; deep-link effect; sidebar buttons |
| `src/graph/GraphPanel.tsx` | `panelId`; drop `initialState`; simplify `onNavigatePage` |
| `src/timeline/TimelinePanel.tsx` | `panelId`; drop `windowRef` |
| `src/canvas/ReferenceCanvasPanel.tsx` | `panelId` |
| `src/__tests__/{graph,timeline,canvas,routes}.test.tsx` | add dock-store isolation to `beforeEach`/`afterEach` |

## Out of scope

- Restoring open windows across a reload (explicitly rejected: the graph would rebuild its force simulation on boot, and reload stops being a way to clear the screen).
- Per-World dock preferences.
- A taskbar for windows fully covered by a full-page window; minimize already parks a window as a bar at the bottom-right (`DockableWindow.tsx:128-130`).
