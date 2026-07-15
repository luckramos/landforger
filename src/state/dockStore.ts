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

/**
 * Runtime state. `mode` is optional on purpose: absent means "the user has no
 * persisted opinion", which is the signal the window component reads to fall
 * back to its own `defaultMode`. Only an explicit setMode (or a restored pref)
 * makes it concrete.
 */
export interface DockPanelState {
  mode?: DockMode
  geometry: DockGeometry
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

/** The viewport size, with an SSR/test fallback; the one definition. */
export function viewport() {
  return {
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }
}

/** The one definition of the geometry clamp; DockableWindow used to own a copy. */
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

/** Geometry each panel falls back to before the user has dragged one. Mode is
    deliberately absent here — the window component owns the mode default. */
export const DEFAULT_DOCK_PREFS: Record<DockPanelId, { geometry: DockGeometry }> = {
  timeline: { geometry: defaultFloatingGeometry() },
  graph: { geometry: defaultFloatingGeometry() },
  canvas: { geometry: defaultFloatingGeometry() },
}

function defaultPanel(id: DockPanelId): DockPanelState {
  return { geometry: DEFAULT_DOCK_PREFS[id].geometry, open: false, minimized: false }
}

function defaultPanels(): Record<DockPanelId, DockPanelState> {
  return {
    timeline: defaultPanel('timeline'),
    graph: defaultPanel('graph'),
    canvas: defaultPanel('canvas'),
  }
}

function userId(value: string): string {
  return value.trim().toLocaleLowerCase()
}

type UserPrefs = Partial<Record<DockPanelId, DockPanelPrefs>>

/** A stored panel entry becomes a concrete pref, or nothing if unusable. */
function normalizePrefs(id: DockPanelId, value: unknown): DockPanelPrefs | undefined {
  const candidate = value && typeof value === 'object' ? value as Partial<DockPanelPrefs> : undefined
  if (!candidate || (candidate.mode !== 'floating' && candidate.mode !== 'fullscreen')) return undefined
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
    mode: candidate.mode,
    // Clamping on read is what stops a window stored on a wider monitor from
    // being restored off-screen in a smaller viewport.
    geometry: clampGeometry(usable ? numbers as DockGeometry : DEFAULT_DOCK_PREFS[id].geometry),
  }
}

function normalizeUserPrefs(value: unknown): UserPrefs {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const prefs: UserPrefs = {}
  for (const id of DOCK_PANEL_IDS) {
    const entry = normalizePrefs(id, candidate[id])
    if (entry) prefs[id] = entry
  }
  return prefs
}

function readPrefs(): Record<string, UserPrefs> {
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

function writePrefs(prefsByUser: Record<string, UserPrefs>): void {
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
  prefsByUser: Record<string, UserPrefs>
  activeUserId?: string
  activateUser: (email?: string) => void
  open: (id: DockPanelId) => void
  close: (id: DockPanelId) => void
  setMode: (id: DockPanelId, mode: DockMode) => void
  setMinimized: (id: DockPanelId, minimized: boolean) => void
  setGeometry: (id: DockPanelId, geometry: DockGeometry) => void
  focus: (id: DockPanelId) => void
}

/** Writes a concrete pref to live state and mirrors it to storage. Callers pass
    a concrete mode — this is the point at which an implicit mode becomes fixed. */
function persistPanel(
  current: DockState,
  id: DockPanelId,
  prefs: DockPanelPrefs,
): DockState {
  const panels = { ...current.panels, [id]: { ...current.panels[id], ...prefs } }
  if (!current.activeUserId) return { ...current, panels }
  // Persist a concrete pref only for the touched panel — never seed the others,
  // or they would lose their "no persisted opinion" state and ignore defaultMode.
  const prefsByUser = {
    ...current.prefsByUser,
    [current.activeUserId]: {
      ...(current.prefsByUser[current.activeUserId] ?? {}),
      [id]: prefs,
    },
  }
  writePrefs(prefsByUser)
  return { ...current, panels, prefsByUser }
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

  setMode: (id, mode) => set((current) => persistPanel(current, id, { mode, geometry: current.panels[id].geometry })),
  setGeometry: (id, geometry) => set((current) => {
    // Geometry only ever changes in floating mode; if the mode was still
    // implicit (defaultMode), dragging makes the floating choice concrete.
    const mode = current.panels[id].mode ?? 'floating'
    return persistPanel(current, id, { mode, geometry: clampGeometry(geometry) })
  }),
}))

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
