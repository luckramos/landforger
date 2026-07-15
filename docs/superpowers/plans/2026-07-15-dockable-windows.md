# Dockable Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dockable panels (Timeline, Relationship Graph, Reference Canvas) open with a page-like transition instead of expanding out of the sidebar, remember their docked/full-page mode and position across sessions, survive navigation without closing or shifting, and can be open several at a time with free z-order.

**Architecture:** A new module-level zustand store (`dockStore`) becomes the single source of truth for which panels are open, their mode, geometry, minimized flag and z-order. `DockableWindow` drops its local `useState` and reads/writes that store via a `panelId` prop. Panels move out of `DashboardShell`'s `?panel=` conditionals into a `DockLayer` rendered outside the pathname-keyed `.view`, so navigation never unmounts them. `?panel=` survives only as a deep-link entry point: consumed on load, then stripped.

**Tech Stack:** React 19, TypeScript, zustand, motion (framer-motion), react-router-dom, Vitest + @testing-library/react + happy-dom, vanilla CSS Modules.

**Spec:** `docs/superpowers/specs/2026-07-15-dockable-windows-design.md`

## Global Constraints

- **Package manager: pnpm, never npm or yarn.** Lockfile is `pnpm-lock.yaml`.
- Verification commands: `pnpm test` (Vitest, full suite), `pnpm typecheck` (`tsc --noEmit`), `pnpm build`.
- Styling: vanilla CSS only — global `src/styles/tokens.css` plus CSS Modules per component. No Tailwind, no CSS-in-JS.
- Motion durations scale via `--mo` (multiply-is-slower), pattern `calc(var(--mo, 1) * <N>ms)`. Every animation must collapse under `prefers-reduced-motion`.
- Motion (framer-motion) is only for dock morphs, staggers and overlay exit fades. Physics/rAF loops stay imperative hooks.
- Use the domain glossary in `CONTEXT.md` for naming: World, Page, Era, Category, Relation, Wikilink — capitalised in prose and copy.
- JS motion constants come from `src/components/motionPrefs.ts`: `EASE_HOUSE = [0.22, 0.61, 0.36, 1]`, `prefersReducedMotion()`, `overlayExitTransition(motionScale)`.
- Tests never touch ambient `localStorage`. Use `createInMemoryStorage()` from `src/__tests__/testStorage.ts` injected through a storage seam. The reason is documented at the top of that file: Node 26's experimental `localStorage` global shadows happy-dom's, so `globalThis.localStorage` is `undefined` in every test.
- Existing `renderAt('/w/ninth-vale?panel=…')` call sites must keep passing. The deep-link entry point is preserved deliberately; if these break, the deep-link effect is wrong.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/state/dockStore.ts` | **New.** Owns all dock state: open/mode/minimized/geometry per panel, plus z-order. Owns persistence of `mode` + `geometry` per user. Exposes `setDockStorage` / `resetDockStore` test seams. |
| `src/__tests__/dock.test.tsx` | **New.** Store unit tests plus the cross-cutting behaviours: entry without geometry morph, survival across navigation, two panels at once, click-to-front. |
| `src/components/DockableWindow/DockLayer.tsx` | **New.** Reads `dockStore`, renders the open panels. Mounted outside the pathname-keyed `.view` so navigation cannot unmount it. Holds the panel→component wiring that used to live in `DashboardShell`'s conditionals. |
| `src/components/DockableWindow/DockableWindow.tsx` | **Modify.** Store-connected via `panelId`; entry animation fix; click-to-front; `useImperativeHandle` deleted. |
| `src/screens/Dashboard/DashboardShell.tsx` | **Modify.** Drops the three `panel === '…'` conditionals and `closePanel`; mounts `DockLayer`; adds the deep-link effect; sidebar links become buttons. |
| `src/graph/GraphPanel.tsx` | **Modify.** Takes `panelId`; drops `initialState`; `onNavigatePage` stops juggling the query string. |
| `src/timeline/TimelinePanel.tsx` | **Modify.** Takes `panelId`; drops `windowRef` / `DockableWindowHandle`. |
| `src/canvas/ReferenceCanvasPanel.tsx` | **Modify.** Takes `panelId`. |
| `src/__tests__/{graph,timeline,canvas,routes}.test.tsx` | **Modify.** Dock-store isolation in `beforeEach`/`afterEach`. |

Task order is dependency order: the store exists before anything consumes it (Task 1), test isolation lands before the store can leak between suites (Task 2), the window is rewired before the layer that renders it (Tasks 3–4), and the shell is cut over last (Task 5), when everything it needs exists.

---

### Task 1: The dock store

Build `dockStore` in isolation with its own tests. Nothing consumes it yet, so this task cannot break the suite.

**Files:**
- Create: `src/state/dockStore.ts`
- Test: `src/__tests__/dock.test.tsx`

**Interfaces:**
- Consumes: `createInMemoryStorage()` from `src/__tests__/testStorage.ts` (tests only).
- Produces — every later task depends on these exact names:
  - `type DockPanelId = 'timeline' | 'graph' | 'canvas'`
  - `interface DockGeometry { x: number; y: number; width: number; height: number }`
  - `interface DockPanelPrefs { mode: DockMode; geometry: DockGeometry }` where `type DockMode = 'fullscreen' | 'floating'`
  - `interface DockPanelState extends DockPanelPrefs { open: boolean; minimized: boolean }`
  - `useDockStore` — a zustand store with `panels: Record<DockPanelId, DockPanelState>`, `zOrder: DockPanelId[]`, `prefsByUser: Record<string, Record<DockPanelId, DockPanelPrefs>>`, `activeUserId?: string`
  - actions: `open(id, defaultMode?)`, `close(id)`, `setMode(id, mode)`, `setMinimized(id, minimized)`, `setGeometry(id, geometry)`, `focus(id)`, `activateUser(email?)`
  - `dockZIndex(zOrder, id): number`
  - `DEFAULT_DOCK_PREFS: Record<DockPanelId, DockPanelPrefs>`
  - `setDockStorage(storage: Storage | null): void`
  - `resetDockStore(): void`

**Why a `zOrder` array and not a counter:** z-index is derived as `70 + zOrder.indexOf(id)`, which stays bounded no matter how many times the user clicks between windows. A monotonic counter would drift upward forever and eventually collide with other stacked layers.

**Why `open`/`minimized` are excluded from persistence:** decided in the spec. A reload starts with a clean screen; only the *habit* (mode + where you left the window) is remembered.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/dock.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DOCK_PREFS,
  dockZIndex,
  resetDockStore,
  setDockStorage,
  useDockStore,
} from '../state/dockStore'
import { createInMemoryStorage } from './testStorage'

let storage: Storage

beforeEach(() => {
  storage = createInMemoryStorage()
  setDockStorage(storage)
  resetDockStore()
})

afterEach(() => {
  setDockStorage(null)
  resetDockStore()
})

describe('dockStore', () => {
  it('starts with every panel closed at its default prefs', () => {
    const { panels, zOrder } = useDockStore.getState()
    expect(panels.graph.open).toBe(false)
    expect(panels.graph.mode).toBe(DEFAULT_DOCK_PREFS.graph.mode)
    expect(zOrder).toEqual([])
  })

  it('persists mode and geometry per user and restores them on activateUser', () => {
    const { activateUser, setMode, setGeometry } = useDockStore.getState()
    activateUser('Sera@LandForger.io')
    setMode('graph', 'floating')
    setGeometry('graph', { x: 120, y: 90, width: 700, height: 480 })

    // A different user must not inherit the first user's habits.
    useDockStore.getState().activateUser('other@landforger.io')
    expect(useDockStore.getState().panels.graph.mode).toBe(DEFAULT_DOCK_PREFS.graph.mode)

    // Email casing must not fork the record.
    useDockStore.getState().activateUser('sera@landforger.io')
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
    expect(useDockStore.getState().panels.graph.geometry).toEqual({ x: 120, y: 90, width: 700, height: 480 })
  })

  it('does not persist open or minimized state', () => {
    const { activateUser, open, setMinimized } = useDockStore.getState()
    activateUser('sera@landforger.io')
    open('timeline')
    setMinimized('timeline', true)

    resetDockStore()
    useDockStore.getState().activateUser('sera@landforger.io')
    expect(useDockStore.getState().panels.timeline.open).toBe(false)
    expect(useDockStore.getState().panels.timeline.minimized).toBe(false)
  })

  it('clamps restored geometry into the current viewport', () => {
    const { activateUser, setGeometry } = useDockStore.getState()
    activateUser('sera@landforger.io')
    // Store a window parked far off the right edge of a wider monitor.
    setGeometry('canvas', { x: 5000, y: 4000, width: 820, height: 620 })

    resetDockStore()
    useDockStore.getState().activateUser('sera@landforger.io')
    const restored = useDockStore.getState().panels.canvas.geometry
    expect(restored.x).toBeLessThanOrEqual(window.innerWidth)
    expect(restored.y).toBeLessThanOrEqual(window.innerHeight)
  })

  it('opens a panel at the top of the z-order and focus brings a panel to front', () => {
    const { open, focus } = useDockStore.getState()
    open('graph')
    open('timeline')
    expect(useDockStore.getState().zOrder).toEqual(['graph', 'timeline'])
    expect(dockZIndex(useDockStore.getState().zOrder, 'timeline')).toBeGreaterThan(
      dockZIndex(useDockStore.getState().zOrder, 'graph'),
    )

    focus('graph')
    expect(useDockStore.getState().zOrder).toEqual(['timeline', 'graph'])
    expect(dockZIndex(useDockStore.getState().zOrder, 'graph')).toBeGreaterThan(
      dockZIndex(useDockStore.getState().zOrder, 'timeline'),
    )
  })

  it('closing removes the panel from the z-order and keeps its prefs', () => {
    const { open, setMode, close } = useDockStore.getState()
    open('graph')
    setMode('graph', 'floating')
    close('graph')
    expect(useDockStore.getState().zOrder).toEqual([])
    expect(useDockStore.getState().panels.graph.open).toBe(false)
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
  })

  it('survives corrupt stored JSON without throwing', () => {
    storage.setItem('landforger:dock:v1', '{ this is not json')
    expect(() => useDockStore.getState().activateUser('sera@landforger.io')).not.toThrow()
    expect(useDockStore.getState().panels.graph.mode).toBe(DEFAULT_DOCK_PREFS.graph.mode)
  })

  it('keeps working when storage is unavailable', () => {
    setDockStorage(null)
    resetDockStore()
    const { activateUser, setMode } = useDockStore.getState()
    activateUser('sera@landforger.io')
    expect(() => setMode('graph', 'floating')).not.toThrow()
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/__tests__/dock.test.tsx`
Expected: FAIL — `Failed to resolve import "../state/dockStore"`.

- [ ] **Step 3: Write the store**

Create `src/state/dockStore.ts`. This mirrors `src/state/uiStore.ts` deliberately: same storage-seam shape, same per-user keying, same normalise-on-read discipline, same "state stays live even when storage is unavailable" tolerance. Read `uiStore.ts` first and follow it.

```ts
import { create } from 'zustand'

export type DockPanelId = 'timeline' | 'graph' | 'canvas'
export type DockMode = 'fullscreen' | 'floating'

export const DOCK_PANEL_IDS: DockPanelId[] = ['timeline', 'graph', 'canvas']

export interface DockGeometry {
  x: number
  y: number
  width: number
  height: number
}

/** The half of a panel's state that outlives the session. */
export interface DockPanelPrefs {
  mode: DockMode
  geometry: DockGeometry
}

/** Runtime state; only the DockPanelPrefs half reaches storage. */
export interface DockPanelState extends DockPanelPrefs {
  open: boolean
  minimized: boolean
}

const MIN_WIDTH = 560
const MIN_HEIGHT = 360
const HEADER_HEIGHT = 52
const BASE_Z = 70
const DOCK_STORAGE_KEY = 'landforger:dock:v1'

let storageOverride: Storage | null | undefined

function dockStorage(): Storage | undefined {
  if (storageOverride !== undefined) return storageOverride ?? undefined
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function viewport() {
  return {
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }
}

/** Identical rules to the geometry clamp DockableWindow used to own. */
export function clampGeometry(geometry: DockGeometry): DockGeometry {
  const size = viewport()
  return {
    x: Math.min(size.width - 72, Math.max(0, geometry.x)),
    y: Math.min(size.height - HEADER_HEIGHT, Math.max(0, geometry.y)),
    width: Math.min(size.width, Math.max(MIN_WIDTH, geometry.width)),
    height: Math.min(size.height, Math.max(MIN_HEIGHT, geometry.height)),
  }
}

export function defaultFloatingGeometry(): DockGeometry {
  const size = viewport()
  const width = Math.min(820, size.width - 80)
  const height = Math.min(620, size.height - 126)
  return { x: Math.max(20, size.width - width - 40), y: 86, width, height }
}

export const DEFAULT_DOCK_PREFS: Record<DockPanelId, DockPanelPrefs> = {
  timeline: { mode: 'fullscreen', geometry: defaultFloatingGeometry() },
  graph: { mode: 'fullscreen', geometry: defaultFloatingGeometry() },
  canvas: { mode: 'fullscreen', geometry: defaultFloatingGeometry() },
}

function defaultPanels(): Record<DockPanelId, DockPanelState> {
  return {
    timeline: { ...DEFAULT_DOCK_PREFS.timeline, open: false, minimized: false },
    graph: { ...DEFAULT_DOCK_PREFS.graph, open: false, minimized: false },
    canvas: { ...DEFAULT_DOCK_PREFS.canvas, open: false, minimized: false },
  }
}

function userId(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function normalizePrefs(id: DockPanelId, value: unknown): DockPanelPrefs {
  const candidate = value && typeof value === 'object' ? value as Partial<DockPanelPrefs> : {}
  const geometry = candidate.geometry && typeof candidate.geometry === 'object'
    ? candidate.geometry as Partial<DockGeometry>
    : {}
  const numbers = {
    x: Number(geometry.x),
    y: Number(geometry.y),
    width: Number(geometry.width),
    height: Number(geometry.height),
  }
  const usable = Object.values(numbers).every((value) => Number.isFinite(value))
  return {
    mode: candidate.mode === 'floating' ? 'floating' : DEFAULT_DOCK_PREFS[id].mode,
    // Clamping on read is what stops a window stored on a wider monitor from
    // being restored off-screen in a smaller viewport.
    geometry: clampGeometry(usable ? numbers as DockGeometry : DEFAULT_DOCK_PREFS[id].geometry),
  }
}

function normalizeUserPrefs(value: unknown): Record<DockPanelId, DockPanelPrefs> {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    timeline: normalizePrefs('timeline', candidate.timeline),
    graph: normalizePrefs('graph', candidate.graph),
    canvas: normalizePrefs('canvas', candidate.canvas),
  }
}

function readPrefs(): Record<string, Record<DockPanelId, DockPanelPrefs>> {
  try {
    const raw = dockStorage()?.getItem(DOCK_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([id, prefs]) => [userId(id), normalizeUserPrefs(prefs)]),
    )
  } catch {
    return {}
  }
}

function writePrefs(prefsByUser: Record<string, Record<DockPanelId, DockPanelPrefs>>): void {
  try {
    dockStorage()?.setItem(DOCK_STORAGE_KEY, JSON.stringify(prefsByUser))
  } catch {
    // Dock state stays live even when storage is unavailable or full.
  }
}

/** Derived, not stored: keeps the stacking bounded however often panels are focused. */
export function dockZIndex(zOrder: DockPanelId[], id: DockPanelId): number {
  return BASE_Z + Math.max(0, zOrder.indexOf(id))
}

interface DockState {
  panels: Record<DockPanelId, DockPanelState>
  zOrder: DockPanelId[]
  prefsByUser: Record<string, Record<DockPanelId, DockPanelPrefs>>
  activeUserId?: string
  activateUser: (email?: string) => void
  open: (id: DockPanelId) => void
  close: (id: DockPanelId) => void
  setMode: (id: DockPanelId, mode: DockMode) => void
  setMinimized: (id: DockPanelId, minimized: boolean) => void
  setGeometry: (id: DockPanelId, geometry: DockGeometry) => void
  focus: (id: DockPanelId) => void
}

export const useDockStore = create<DockState>((set) => ({
  panels: defaultPanels(),
  zOrder: [],
  prefsByUser: {},
  activeUserId: undefined,

  activateUser: (email) => set((current) => {
    if (!email) return { ...current, activeUserId: undefined, panels: defaultPanels(), zOrder: [] }
    const id = userId(email)
    const prefsByUser = readPrefs()
    const prefs = prefsByUser[id] ?? DEFAULT_DOCK_PREFS
    const panels = defaultPanels()
    for (const panelId of DOCK_PANEL_IDS) {
      panels[panelId] = { ...panels[panelId], ...prefs[panelId] }
    }
    return { ...current, activeUserId: id, prefsByUser, panels, zOrder: [] }
  }),

  open: (id) => set((current) => ({
    ...current,
    panels: { ...current.panels, [id]: { ...current.panels[id], open: true, minimized: false } },
    zOrder: [...current.zOrder.filter((panelId) => panelId !== id), id],
  })),

  close: (id) => set((current) => ({
    ...current,
    panels: { ...current.panels, [id]: { ...current.panels[id], open: false, minimized: false } },
    zOrder: current.zOrder.filter((panelId) => panelId !== id),
  })),

  focus: (id) => set((current) => (
    current.zOrder.at(-1) === id
      ? current
      : { ...current, zOrder: [...current.zOrder.filter((panelId) => panelId !== id), id] }
  )),

  setMinimized: (id, minimized) => set((current) => ({
    ...current,
    panels: { ...current.panels, [id]: { ...current.panels[id], minimized } },
  })),

  setMode: (id, mode) => set((current) => persistPanel(current, id, { mode })),
  setGeometry: (id, geometry) => set((current) => persistPanel(current, id, { geometry: clampGeometry(geometry) })),
}))

/** Applies a prefs patch to live state and mirrors the persisted half to storage. */
function persistPanel(
  current: DockState,
  id: DockPanelId,
  patch: Partial<DockPanelPrefs>,
): DockState {
  const panel = { ...current.panels[id], ...patch }
  const panels = { ...current.panels, [id]: panel }
  if (!current.activeUserId) return { ...current, panels }
  const prefsByUser = {
    ...current.prefsByUser,
    [current.activeUserId]: {
      ...(current.prefsByUser[current.activeUserId] ?? DEFAULT_DOCK_PREFS),
      [id]: { mode: panel.mode, geometry: panel.geometry },
    },
  }
  writePrefs(prefsByUser)
  return { ...current, panels, prefsByUser }
}

/** Test seam for deterministic persistence without touching ambient localStorage. */
export function setDockStorage(storage: Storage | null): void {
  storageOverride = storage
}

/** Test seam: the store is module-level, so suites must reset it between cases. */
export function resetDockStore(): void {
  useDockStore.setState({
    panels: defaultPanels(),
    zOrder: [],
    prefsByUser: {},
    activeUserId: undefined,
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/__tests__/dock.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/state/dockStore.ts src/__tests__/dock.test.tsx
git commit -m "feat(dock): add dockStore with per-user mode and geometry persistence"
```

---

### Task 2: Dock-store isolation in the existing panel suites

`dockStore` is module-level and the panel suites mount real panels ~20 times. Land isolation *before* anything writes to the store during those tests, or failures will appear in unrelated suites and look like flakes.

**Files:**
- Modify: `src/__tests__/graph.test.tsx` (`beforeEach`/`afterEach`)
- Modify: `src/__tests__/timeline.test.tsx` (`beforeEach`/`afterEach`)
- Modify: `src/__tests__/canvas.test.tsx` (`beforeEach`/`afterEach`)
- Modify: `src/__tests__/routes.test.tsx` (`beforeEach`/`afterEach`)

**Interfaces:**
- Consumes: `setDockStorage`, `resetDockStore` from Task 1; `createInMemoryStorage` from `src/__tests__/testStorage.ts`.
- Produces: nothing. Setup only.

- [ ] **Step 1: Add isolation to each suite**

In each of the four files, add to the imports:

```tsx
import { resetDockStore, setDockStorage } from '../state/dockStore'
```

Then extend the existing `beforeEach` (each file already has one that calls `setRepository`) with these two lines, and the existing `afterEach` with the third. Follow `src/__tests__/userMenu.test.tsx:12-22`, which does exactly this for `setUiStorage`:

```tsx
beforeEach(() => {
  // …existing setRepository(…) line stays as-is…
  setDockStorage(createInMemoryStorage())
  resetDockStore()
})

afterEach(() => {
  // …existing lines stay as-is…
  setDockStorage(null)
})
```

`canvas.test.tsx` and `graph.test.tsx` already import `createInMemoryStorage`. Check `timeline.test.tsx` and `routes.test.tsx` and add the import from `./testStorage` if it is missing.

- [ ] **Step 2: Run the four suites**

Run: `pnpm test src/__tests__/graph.test.tsx src/__tests__/timeline.test.tsx src/__tests__/canvas.test.tsx src/__tests__/routes.test.tsx`
Expected: PASS. Nothing consumes the store yet, so this is a pure no-op that only proves the seams import cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/graph.test.tsx src/__tests__/timeline.test.tsx src/__tests__/canvas.test.tsx src/__tests__/routes.test.tsx
git commit -m "test(dock): isolate the module-level dock store between panel suites"
```

---

### Task 3: Store-connected DockableWindow with the entry fix

The heart of the change. Two things happen together because they touch the same JSX: state moves to the store, and the entry animation stops morphing geometry.

**Files:**
- Modify: `src/components/DockableWindow/DockableWindow.tsx` (whole component)
- Test: `src/__tests__/dock.test.tsx` (append)

**Interfaces:**
- Consumes: everything Task 1 produced; `EASE_HOUSE`, `prefersReducedMotion`, `overlayExitTransition` from `src/components/motionPrefs.ts`; `useUiStore` for `motionScale`.
- Produces:
  - `DockableWindowProps` gains `panelId: DockPanelId` and renames `initialState?: 'fullscreen' | 'floating'` to `defaultMode?: DockMode`.
  - `DockableWindowHandle` and the `ref` prop are **deleted**. Task 4 depends on them being gone.

**The bug being fixed:** `.window` is `position: fixed` with no `left/top/width/height` in `DockableWindow.module.css:1`, and the current `initial={{ opacity: 0 }}` (line 164) gives Motion no geometry. Motion therefore resolves the start value from the DOM — the element's *static* position inside the shell grid, right of the sidebar, at content width — and animates to fullscreen. That is the "expanding from the sidebar". Putting the full final geometry in `initial` makes the mount delta zero, so the morph becomes arithmetically impossible rather than merely unlikely.

**Why no "has mounted" flag:** Motion accepts per-property transitions. `opacity`/`y`/`scale` carry the entry duration; the geometry keys keep the 340ms house morph. At mount the 340ms runs across a zero delta and is invisible. Afterwards the header's full-page↔floating toggle morphs exactly as it does today.

**Entry values, from the spec:** full-page reuses the established page transition `lw-view-in` (`DashboardShell.module.css:86`) — `opacity 0→1`, `translateY(10px)→0`, `scale(.994)→1`, 300ms `EASE_HOUSE`. Floating pops in place — `opacity 0→1`, `scale(.96)→1`, 200ms `EASE_HOUSE`, origin at the window's own centre (the CSS default; do not set `transform-origin`).

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/dock.test.tsx`. Add these imports at the top of the file:

```tsx
import { render, screen } from '@testing-library/react'
import { DockableWindow } from '../components/DockableWindow/DockableWindow'
```

```tsx
describe('DockableWindow entry', () => {
  function renderWindow(panelId: 'graph' | 'timeline' = 'graph') {
    useDockStore.getState().open(panelId)
    return render(
      <DockableWindow panelId={panelId} title="Relationship graph" onClose={() => {}}>
        <p>graph body</p>
      </DockableWindow>,
    )
  }

  it('mounts full-page at its final geometry so no sidebar morph is possible', () => {
    renderWindow()
    const dialog = screen.getByRole('dialog', { name: 'Relationship graph' })
    // A fullscreen window is pinned to the viewport origin from the very first
    // frame. Any non-zero left/top here means Motion resolved geometry from the
    // DOM's static position — the sidebar-expansion bug.
    expect(dialog.style.left).toBe('0px')
    expect(dialog.style.top).toBe('0px')
  })

  it('mounts floating at its persisted geometry rather than travelling to it', () => {
    useDockStore.getState().activateUser('sera@landforger.io')
    useDockStore.getState().setMode('graph', 'floating')
    useDockStore.getState().setGeometry('graph', { x: 140, y: 100, width: 700, height: 480 })
    renderWindow()
    const dialog = screen.getByRole('dialog', { name: 'Relationship graph' })
    expect(dialog.style.left).toBe('140px')
    expect(dialog.style.top).toBe('100px')
  })

  it('reads mode from the store and writes the header toggle back to it', () => {
    useDockStore.getState().activateUser('sera@landforger.io')
    renderWindow()
    fireEvent.click(screen.getByRole('button', { name: 'Float window' }))
    expect(useDockStore.getState().panels.graph.mode).toBe('floating')
  })

  it('brings a window to the front on pointerdown', () => {
    useDockStore.getState().open('timeline')
    renderWindow('graph')
    expect(useDockStore.getState().zOrder.at(-1)).toBe('graph')
    useDockStore.getState().focus('timeline')
    fireEvent.pointerDown(screen.getByRole('dialog', { name: 'Relationship graph' }))
    expect(useDockStore.getState().zOrder.at(-1)).toBe('graph')
  })
})
```

Add `fireEvent` to the existing `@testing-library/react` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/__tests__/dock.test.tsx`
Expected: FAIL — the `panelId` prop does not exist yet; TypeScript errors and the geometry assertions do not hold.

- [ ] **Step 3: Rewrite the component**

Replace the body of `src/components/DockableWindow/DockableWindow.tsx`. Delete these, which now live in the store: the `Geometry` interface, `viewport()`, `defaultFloatingGeometry()`, `clampGeometry()`, `MIN_WIDTH`, `MIN_HEIGHT`, the `mode`/`minimized`/`floating` `useState`, `floatingRef`, `DockableWindowHandle`, `useImperativeHandle` and the `ref` prop. Keep `PointerOperation`, the pointer-tracking effect, the resize effect, and the entire JSX structure below the `motion.section` props.

```tsx
import { motion } from 'motion/react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { icons } from '../../icons'
import {
  clampGeometry,
  dockZIndex,
  useDockStore,
  type DockGeometry,
  type DockMode,
  type DockPanelId,
} from '../../state/dockStore'
import { useUiStore } from '../../state/uiStore'
import { EASE_HOUSE, overlayExitTransition, prefersReducedMotion } from '../motionPrefs'
import styles from './DockableWindow.module.css'

interface PointerOperation {
  kind: 'drag' | 'resize'
  startX: number
  startY: number
  geometry: DockGeometry
}

export interface DockableWindowProps {
  panelId: DockPanelId
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  toolbar?: ReactNode
  /** Fallback used only when the user has no persisted mode for this panel. */
  defaultMode?: DockMode
  icon?: ReactNode
  accent?: string
}

const HEADER_HEIGHT = 52

/** The page transition every route already uses (`lw-view-in`, DashboardShell.module.css). */
const FULLSCREEN_ENTRY = { opacity: 0, y: 10, scale: 0.994 }
const FLOATING_ENTRY = { opacity: 0, scale: 0.96 }

export function DockableWindow({
  panelId,
  title,
  subtitle,
  children,
  onClose,
  toolbar,
  defaultMode,
  icon = <icons.panel size={16} aria-hidden="true" />,
  accent = 'var(--bronze)',
}: DockableWindowProps) {
  const panel = useDockStore((state) => state.panels[panelId])
  const zOrder = useDockStore((state) => state.zOrder)
  const setMode = useDockStore((state) => state.setMode)
  const setMinimized = useDockStore((state) => state.setMinimized)
  const setGeometry = useDockStore((state) => state.setGeometry)
  const focus = useDockStore((state) => state.focus)
  const motionScale = useUiStore((state) => state.motionScale)
  const [pointerOperation, setPointerOperation] = useState<PointerOperation>()

  const { minimized } = panel
  const mode = panel.mode ?? defaultMode ?? 'fullscreen'

  useEffect(() => {
    if (!pointerOperation) return
    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - pointerOperation.startX
      const dy = event.clientY - pointerOperation.startY
      setGeometry(
        panelId,
        pointerOperation.kind === 'drag'
          ? { ...pointerOperation.geometry, x: pointerOperation.geometry.x + dx, y: pointerOperation.geometry.y + dy }
          : {
              ...pointerOperation.geometry,
              width: pointerOperation.geometry.width + dx,
              height: pointerOperation.geometry.height + dy,
            },
      )
    }
    const onUp = () => setPointerOperation(undefined)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp, { once: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [panelId, pointerOperation, setGeometry])

  useEffect(() => {
    const onResize = () => setGeometry(panelId, clampGeometry(useDockStore.getState().panels[panelId].geometry))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [panelId, setGeometry])

  const geometry = useMemo(() => {
    const width = typeof window === 'undefined' ? 1440 : window.innerWidth
    const height = typeof window === 'undefined' ? 900 : window.innerHeight
    if (minimized) {
      const barWidth = Math.min(460, width - 32)
      return { left: width - barWidth - 20, top: height - HEADER_HEIGHT - 18, width: barWidth, height: HEADER_HEIGHT }
    }
    if (mode === 'fullscreen') return { left: 0, top: 0, width, height }
    return { left: panel.geometry.x, top: panel.geometry.y, width: panel.geometry.width, height: panel.geometry.height }
  }, [minimized, mode, panel.geometry])

  const beginPointerOperation = (kind: PointerOperation['kind'], event: ReactPointerEvent) => {
    if (mode !== 'floating' || minimized || event.button !== 0) return
    if (kind === 'drag' && (event.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]')) return
    event.preventDefault()
    setPointerOperation({ kind, startX: event.clientX, startY: event.clientY, geometry: panel.geometry })
  }

  const reduced = prefersReducedMotion()
  const dockState = minimized ? 'minimized' : mode
  const entry = mode === 'fullscreen' ? FULLSCREEN_ENTRY : FLOATING_ENTRY
  const entryDuration = reduced ? 0 : (mode === 'fullscreen' ? 0.3 : 0.2) * motionScale
  const entryTransition = { duration: entryDuration, ease: EASE_HOUSE }

  return (
    <motion.section
      className={styles.window}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-dock-state={dockState}
      data-dragging={pointerOperation ? 'true' : undefined}
      style={{ '--dock-accent': accent, zIndex: dockZIndex(zOrder, panelId) } as CSSProperties}
      onPointerDown={() => focus(panelId)}
      /* Geometry is in `initial` on purpose: without it Motion resolves the
         start value from the DOM's static position and the window flies in
         from beside the sidebar. With it, the mount delta is zero. */
      initial={{ ...geometry, ...entry }}
      animate={{
        ...geometry,
        opacity: 1,
        y: 0,
        scale: 1,
        borderRadius: mode === 'fullscreen' && !minimized ? 0 : 12,
      }}
      exit={{ opacity: 0, transition: overlayExitTransition(motionScale) }}
      transition={{
        duration: reduced || pointerOperation ? 0 : 0.34 * motionScale,
        ease: EASE_HOUSE,
        opacity: entryTransition,
        y: entryTransition,
        scale: entryTransition,
      }}
    >
```

Everything from `<header className={styles.header}` to the closing `</motion.section>` stays byte-for-byte as it is today, with exactly three edits inside it:

1. `onClick={() => setMinimized(false)}` becomes `onClick={() => setMinimized(panelId, false)}`
2. `onClick={() => setMode((current) => (current === 'fullscreen' ? 'floating' : 'fullscreen'))}` becomes `onClick={() => setMode(panelId, mode === 'fullscreen' ? 'floating' : 'fullscreen')}`
3. `onClick={() => setMinimized(true)}` becomes `onClick={() => setMinimized(panelId, true)}`

The `.window` CSS keeps `z-index: 70` as its floor; the inline `zIndex` from `dockZIndex` overrides it. Leave `DockableWindow.module.css` untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/__tests__/dock.test.tsx`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: errors *only* in `GraphPanel.tsx`, `TimelinePanel.tsx`, `ReferenceCanvasPanel.tsx` — missing `panelId`, and `TimelinePanel`'s now-deleted `DockableWindowHandle` import. Task 4 fixes all of them. Do not fix them here; do not commit yet if you prefer a green tree — otherwise commit and let Task 4 restore it.

- [ ] **Step 6: Commit**

```bash
git add src/components/DockableWindow/DockableWindow.tsx src/__tests__/dock.test.tsx
git commit -m "feat(dock): connect DockableWindow to dockStore and mount without a geometry morph"
```

---

### Task 4: Panels take a panelId; DockLayer renders them

Restores the tree to green and puts the panels somewhere navigation cannot unmount them.

**Files:**
- Create: `src/components/DockableWindow/DockLayer.tsx`
- Modify: `src/graph/GraphPanel.tsx:52-61` (the `DockableWindow` props) and `GraphPanelProps`
- Modify: `src/timeline/TimelinePanel.tsx:3` (import), `:40` (`windowRef`), `:46-49` (`openPage`), `:160` (props)
- Modify: `src/canvas/ReferenceCanvasPanel.tsx:438-444` (props) and its props interface

**Interfaces:**
- Consumes: `DockableWindowProps` from Task 3; `useDockStore`, `DockPanelId` from Task 1.
- Produces: `DockLayer`, taking `{ world, pages, repository, focusedPageSlug?, pageSlug? }` and rendering the open panels inside a single `AnimatePresence`. Task 5 mounts it.

- [ ] **Step 1: Give each panel its panelId**

`GraphPanel.tsx` — in the `DockableWindow` element (line 53), replace `initialState={focalSlug ? 'floating' : 'fullscreen'}` with:

```tsx
panelId="graph"
defaultMode={focalSlug ? 'floating' : 'fullscreen'}
```

`ReferenceCanvasPanel.tsx` — add `panelId="canvas"` to the `DockableWindow` element (line 439).

`TimelinePanel.tsx` — add `panelId="timeline"` to the `DockableWindow` element (line 160). Remove the `DockableWindowHandle` type import (line 3) and the `windowRef` declaration (line 40), and drop `ref={windowRef}` from the element. Then rewrite `openPage` (lines 46-49):

```tsx
const setMode = useDockStore((state) => state.setMode)

/* Docking first keeps the Page reachable behind the Timeline, so the reader
   watches the Page they picked load instead of losing it under a fullscreen
   panel. */
const openPage = (slug: string) => {
  setMode('timeline', 'floating')
  onNavigatePage(slug)
}
```

Add `import { useDockStore } from '../state/dockStore'` to `TimelinePanel.tsx`. The comment is retained verbatim — the intent behind that call is unchanged, only its mechanism.

- [ ] **Step 2: Write DockLayer**

Create `src/components/DockableWindow/DockLayer.tsx`. This is the panel-wiring that used to sit in `DashboardShell`'s `?panel=` conditionals, moved somewhere the router cannot unmount it.

```tsx
import { AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ReferenceCanvasPanel } from '../../canvas/ReferenceCanvasPanel'
import type { Page, World } from '../../domain/types'
import { GraphPanel } from '../../graph/GraphPanel'
import type { WorldRepository } from '../../repository/WorldRepository'
import { useDockStore } from '../../state/dockStore'
import { TimelinePanel } from '../../timeline/TimelinePanel'

export interface DockLayerProps {
  world: World
  pages: Page[]
  repository: WorldRepository
  /** Slug the Timeline should scroll to, from `?focus=`. */
  focusedPageSlug?: string
  /** The Page currently under the windows, which scopes the Graph's local view. */
  pageSlug?: string
}

/**
 * Renders the open dockable panels. Mounted by DashboardShell *outside* the
 * pathname-keyed `.view`, so navigating between Pages never unmounts a window
 * — the window keeps its geometry, scroll and internal state untouched.
 */
export function DockLayer({ world, pages, repository, focusedPageSlug, pageSlug }: DockLayerProps) {
  const panels = useDockStore((state) => state.panels)
  const close = useDockStore((state) => state.close)
  const navigate = useNavigate()

  return (
    <AnimatePresence>
      {panels.timeline.open && (
        <TimelinePanel
          key="timeline"
          world={world}
          pages={pages}
          repository={repository}
          focusPage={focusedPageSlug}
          onClose={() => close('timeline')}
          onNavigatePage={(slug) => navigate(`/w/${world.slug}/p/${slug}`)}
        />
      )}

      {panels.graph.open && (
        <GraphPanel
          key="graph"
          world={world}
          pages={pages}
          focalSlug={pageSlug}
          onClose={() => close('graph')}
          onNavigatePage={(slug) => navigate(`/w/${world.slug}/p/${slug}`)}
        />
      )}

      {panels.canvas.open && (
        <ReferenceCanvasPanel
          key="canvas"
          world={world}
          repository={repository}
          onClose={() => close('canvas')}
        />
      )}
    </AnimatePresence>
  )
}
```

Note both `onNavigatePage` callbacks are now plain navigations. The query-string juggling that used to keep `?panel=timeline` alive (`DashboardShell.tsx:237`) and the version that dropped `?panel=graph` and closed the window (`DashboardShell.tsx:247`) are both gone: the store decides what is open, so navigation simply does not affect it.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. `DashboardShell` still renders the panels through its old conditionals and still compiles — Task 5 cuts it over.

- [ ] **Step 4: Commit**

```bash
git add src/components/DockableWindow/DockLayer.tsx src/graph/GraphPanel.tsx src/timeline/TimelinePanel.tsx src/canvas/ReferenceCanvasPanel.tsx
git commit -m "feat(dock): add DockLayer and give each panel a panelId"
```

---

### Task 5: Cut DashboardShell over to the store

The last wiring step: the shell stops owning panel state and `?panel=` becomes a pure entry point.

**Files:**
- Modify: `src/screens/Dashboard/DashboardShell.tsx` — imports, `panel` derivation (`:31`), `closePanel` (`:129-134`), sidebar links (`:192-194`), the `AnimatePresence` block (`:229-258`)
- Test: `src/__tests__/dock.test.tsx` (append)

**Interfaces:**
- Consumes: `DockLayer` from Task 4; `useDockStore` from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/dock.test.tsx`. This suite needs the repository fixtures, so add these imports:

```tsx
import { MemoryRouter } from 'react-router-dom'
import { act, waitFor } from '@testing-library/react'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
```

```tsx
describe('dock layer in the shell', () => {
  beforeEach(() => {
    setRepository(new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles))
  })

  afterEach(() => setRepository(undefined))

  async function renderAt(path: string) {
    const result = render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
    await act(async () => {})
    return result
  }

  it('opens a panel from ?panel= and strips the param', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    expect(await screen.findByRole('dialog', { name: 'Relationship graph' })).toBeTruthy()
    expect(useDockStore.getState().panels.graph.open).toBe(true)
  })

  it('keeps a docked window open, mounted and unmoved across navigation', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Float window' }))
    await waitFor(() => expect(useDockStore.getState().panels.graph.mode).toBe('floating'))
    const geometryBefore = useDockStore.getState().panels.graph.geometry

    // Navigate underneath the window via a sidebar Category link.
    fireEvent.click(screen.getByRole('link', { name: /Places/i }))
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Relationship graph' })).toBeTruthy()
    expect(useDockStore.getState().panels.graph.geometry).toEqual(geometryBefore)
  })

  it('opens the Timeline and the Graph at the same time', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    await screen.findByRole('dialog', { name: 'Relationship graph' })
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Relationship graph' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Timeline' })).toBeTruthy()
  })
})
```

Add `within` to the `@testing-library/react` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/__tests__/dock.test.tsx`
Expected: FAIL — the sidebar still renders `Timeline` as a link, not a button, and navigation still closes the graph.

- [ ] **Step 3: Cut the shell over**

In `src/screens/Dashboard/DashboardShell.tsx`:

Add the imports and drop the three panel imports plus `AnimatePresence`:

```tsx
import { DockLayer } from '../../components/DockableWindow/DockLayer'
import { DOCK_PANEL_IDS, useDockStore, type DockPanelId } from '../../state/dockStore'
```

Delete: `import { AnimatePresence } from 'motion/react'`, `import { ReferenceCanvasPanel } …`, `import { TimelinePanel } …`, `import { GraphPanel } …`. `SpotlightSearch` moves out of the deleted `AnimatePresence` and renders on its own — it was never a dockable panel and does not belong in the dock layer.

Replace the `panel` derivation (line 31) and add the deep-link effect:

```tsx
const openPanel = useDockStore((state) => state.open)

/* `?panel=` is an entry point, not state: it opens the panel once and is
   stripped, so navigation and the browser Back button never fight the store
   over which windows are on screen. */
useEffect(() => {
  const requested = new URLSearchParams(location.search).get('panel')
  if (!requested || !DOCK_PANEL_IDS.includes(requested as DockPanelId)) return
  openPanel(requested as DockPanelId)
  const next = new URLSearchParams(location.search)
  next.delete('panel')
  navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
}, [location.pathname, location.search, navigate, openPanel])
```

Delete the `closePanel` function (lines 129-134) — `DockLayer` closes panels through the store.

Replace the three sidebar panel links (lines 192-194) with buttons. Keep `styles.navItem` so they look identical; add `type="button"`:

```tsx
<button type="button" className={styles.navItem} onClick={() => openPanel('timeline')}>
  <span><icons.timeline /></span><span className={styles.expandedOnly}>Timeline</span>
</button>
<button type="button" className={styles.navItem} onClick={() => openPanel('graph')}>
  <span><icons.graph /></span><span className={styles.expandedOnly}>Graph view</span>
</button>
<button type="button" className={styles.navItem} onClick={() => openPanel('canvas')}>
  <span><icons.canvas /></span><span className={styles.expandedOnly}>Reference canvas</span>
</button>
```

The World map entry above them stays a `Link` — it is a route, not a panel.

Replace the whole `AnimatePresence` block (lines 229-258) with:

```tsx
<DockLayer
  world={world}
  pages={pages}
  repository={repository}
  focusedPageSlug={focusedPageSlug}
  pageSlug={pageSlug}
/>

{searchOpen && (
  <SpotlightSearch pages={pages} worldSlug={world.slug} onClose={() => setSearchOpen(false)} />
)}
```

- [ ] **Step 4: Check the sidebar buttons still look like the links**

`.navItem` is styled for `<a>`. Open `src/screens/Dashboard/DashboardShell.module.css`, find the `.navItem` rule, and if it is scoped as `a.navItem` — or relies on an anchor default such as `text-decoration` or `display` — widen the selector to cover `button.navItem` and add `width: 100%; border: 0; background: none; font: inherit; text-align: left; cursor: pointer;`. If `.navItem` is already element-agnostic, change nothing.

- [ ] **Step 5: Run the dock suite**

Run: `pnpm test src/__tests__/dock.test.tsx`
Expected: PASS, 15 tests.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS. The ~20 `renderAt('/w/ninth-vale?panel=…')` call sites in `graph`, `timeline`, `canvas` and `routes` must still pass — the deep-link effect is what keeps them green. If a suite reports "found multiple elements with role dialog", the dock store is leaking between cases: check that Task 2's `resetDockStore()` landed in that file's `beforeEach`.

- [ ] **Step 7: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/screens/Dashboard/DashboardShell.tsx src/screens/Dashboard/DashboardShell.module.css src/__tests__/dock.test.tsx
git commit -m "feat(dock): drive panels from dockStore so they survive navigation"
```

---

### Task 6: Wire dock prefs to the signed-in user

`activateUser` exists but nothing calls it, so persistence never keys to anyone. `MotionRoot` already does this for `uiStore`.

**Files:**
- Modify: `src/App.tsx:9-19` (`MotionRoot`)
- Test: `src/__tests__/dock.test.tsx` (append)

**Interfaces:**
- Consumes: `useDockStore.activateUser` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

```tsx
it('loads the signed-in user dock prefs through the app root', async () => {
  setDockStorage(storage)
  useDockStore.getState().activateUser('sera@landforger.io')
  useDockStore.getState().setMode('graph', 'floating')
  resetDockStore()

  useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
  render(<MotionRoot><span>app</span></MotionRoot>)
  await waitFor(() => expect(useDockStore.getState().panels.graph.mode).toBe('floating'))
})
```

Add to the imports: `import { MotionRoot } from '../App'` and `import { useSessionStore } from '../state/sessionStore'`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/__tests__/dock.test.tsx`
Expected: FAIL — mode is `'fullscreen'`; nothing calls `activateUser`.

- [ ] **Step 3: Activate the dock user alongside the UI user**

In `src/App.tsx`, add to `MotionRoot`:

```tsx
const activateDockUser = useDockStore((s) => s.activateUser)
useLayoutEffect(() => activateDockUser(userEmail), [activateDockUser, userEmail])
```

Add `import { useDockStore } from './state/dockStore'`. Place the effect next to the existing `activateUser(userEmail)` line so the two user-scoped stores load together and stay easy to find.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/__tests__/dock.test.tsx`
Expected: PASS, 16 tests.

- [ ] **Step 5: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/__tests__/dock.test.tsx
git commit -m "feat(dock): scope dock prefs to the signed-in user"
```

---

### Task 7: Manual verification

Automated tests cannot see a morph. happy-dom runs no animations, so the sidebar-expansion bug is invisible to Vitest — the regression tests in Task 3 assert the *precondition* (geometry present in `initial`), not the visual result. A human must watch the three transitions once.

**Note:** the chrome-devtools MCP browser does not work in this WSL environment. Verify by hand in a real browser.

- [ ] **Step 1: Run the dev server**

Run: `pnpm dev`

- [ ] **Step 2: Walk the checklist**

1. `/w/ninth-vale` → sidebar → **Graph view**. It must fade and rise in place like a page. It must not fly out of the sidebar, and must not grow from a corner.
2. Header → **Float window**. It should morph to floating over 340ms — the morph is intentional here and stays.
3. Drag it somewhere memorable, resize it, then reload the page. The window must be closed. Open Graph view again: it comes back floating, at the size and position you left it, popping in place rather than travelling there.
4. With the Graph floating, click a Category in the sidebar. The window must stay open, at the exact same pixel position, with no jump or reflow. The page behind it changes.
5. Open **Timeline** with the Graph still open. Both windows on screen at once. Click the Graph — it comes to the front. Click the Timeline — it comes to the front.
6. In the Timeline, click a Page. The Timeline should dock itself to floating first, then navigate, so you watch the Page load behind it.
7. In macOS/GNOME reduced-motion (or DevTools → Rendering → Emulate `prefers-reduced-motion`), repeat step 1. The window must appear with no animation at all.

- [ ] **Step 3: Commit nothing**

Verification only. If any step fails, the fix belongs to the task that owns that behaviour.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Full-page entry reuses `lw-view-in` | 3 (`FULLSCREEN_ENTRY`) |
| Floating entry pops in place | 3 (`FLOATING_ENTRY`) |
| No geometry morph at mount | 3 (`initial` carries geometry) + 7 step 2.1 |
| `mode` + `geometry` persist per user | 1 (`persistPanel`) + 6 (`activateUser` wiring) |
| Open/minimized never persist | 1 |
| Preference is global, not per World | 1 (keyed by user id only) |
| Clamp restored geometry | 1 (`normalizePrefs`) |
| `?panel=` as deep-link entry, stripped | 5 |
| Store is source of truth | 1 + 5 |
| Windows survive navigation, no shifting | 4 (`DockLayer` outside `.view`) + 5 test |
| Multiple windows at once | 4 + 5 test |
| Free z-order, click-to-front | 1 (`dockZIndex`, `focus`) + 3 (`onPointerDown`) |
| `useImperativeHandle` deleted, intent preserved | 3 + 4 |
| Test isolation for the module-level store | 2 |
| Existing `?panel=` call sites keep passing | 2 + 5 step 6 |

No gaps.

**Placeholder scan:** none. Every code step carries its code; every command carries expected output.

**Type consistency:** `DockPanelId`, `DockMode`, `DockGeometry`, `DockPanelPrefs`, `DockPanelState`, `dockZIndex(zOrder, id)`, `setGeometry(id, geometry)`, `setMinimized(id, minimized)`, `setMode(id, mode)`, `open(id)`, `close(id)`, `focus(id)`, `activateUser(email?)`, `setDockStorage`, `resetDockStore`, `DEFAULT_DOCK_PREFS`, `DOCK_PANEL_IDS`, `clampGeometry`, `defaultFloatingGeometry` are used identically in Tasks 1, 3, 4, 5 and 6. `initialState` → `defaultMode` is renamed in Task 3 and consumed under the new name in Task 4 only.

One deliberate deviation from the spec, found while reading the tests: the spec predicted rewriting `?panel=` assertions across four suites. Those assertions are correct as written and stay untouched, because the deep-link entry point is preserved. The real work in those files is store isolation, which the spec did not anticipate. Task 2 covers it and the spec has been corrected.
