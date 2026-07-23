import { create } from 'zustand'

/** Where the editor's format toolbar docks — persisted like any other measure. */
export type ToolbarAnchor = 'top' | 'bottom'

export interface UserSettings {
  /** Motion scale — multiply-is-slower; written to `--mo` on the app root. */
  motionScale: number
  /**
   * Writing-column width in CSS px — the Page's "measure". Clamped to
   * [MIN_PAGE_WIDTH, MAX_PAGE_WIDTH]; the caller wraps it in a `min(…, 100vw…)`
   * so a wide setting never overflows a narrow viewport.
   */
  pageWidth: number
  /** Editor format-toolbar dock, remembered across Pages and reloads. */
  toolbarAnchor: ToolbarAnchor
}

/** The current fixed measure (~65-70ch, see PageEditor.module.css) — the floor. */
export const MIN_PAGE_WIDTH = 640
/** Widest the column may grow before the measure stops reading as a document. */
export const MAX_PAGE_WIDTH = 1024

export const DEFAULT_USER_SETTINGS: UserSettings = {
  motionScale: 1,
  pageWidth: MIN_PAGE_WIDTH,
  toolbarAnchor: 'top',
}

const SETTINGS_STORAGE_KEY = 'landforger:user-settings:v1'
let storageOverride: Storage | null | undefined

function settingsStorage(): Storage | undefined {
  if (storageOverride !== undefined) return storageOverride ?? undefined
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function userId(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function clampMotionScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_USER_SETTINGS.motionScale
  return Math.max(0.5, Math.min(1.5, value))
}

function clampPageWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_USER_SETTINGS.pageWidth
  return Math.round(Math.max(MIN_PAGE_WIDTH, Math.min(MAX_PAGE_WIDTH, value)))
}

function normalizeSettings(value: unknown): UserSettings {
  const candidate = value && typeof value === 'object' ? value as Partial<UserSettings> : {}
  return {
    motionScale: clampMotionScale(Number(candidate.motionScale)),
    pageWidth: clampPageWidth(Number(candidate.pageWidth)),
    toolbarAnchor: candidate.toolbarAnchor === 'bottom' ? 'bottom' : 'top',
  }
}

function readSettings(): Record<string, UserSettings> {
  try {
    const raw = settingsStorage()?.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([id, settings]) => [userId(id), normalizeSettings(settings)]),
    )
  } catch {
    return {}
  }
}

function writeSettings(settingsByUser: Record<string, UserSettings>): void {
  try {
    settingsStorage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsByUser))
  } catch {
    // Settings remain live even when storage is unavailable or full.
  }
}

interface UiState extends UserSettings {
  activeUserId?: string
  settingsByUser: Record<string, UserSettings>
  activateUser: (email?: string) => void
  setMotionScale: (scale: number) => void
  setPageWidth: (width: number) => void
  setToolbarAnchor: (anchor: ToolbarAnchor) => void
}

/** The pure UserSettings slice of the live state. */
function currentSettings(state: UiState): UserSettings {
  return { motionScale: state.motionScale, pageWidth: state.pageWidth, toolbarAnchor: state.toolbarAnchor }
}

/**
 * Apply a settings patch to the live state and, for a signed-in user, persist
 * the *complete* settings object — so writing one setting never drops another.
 */
function applySetting(state: UiState, patch: Partial<UserSettings>): Partial<UiState> {
  const next = { ...currentSettings(state), ...patch }
  if (!state.activeUserId) return next
  const settingsByUser = { ...state.settingsByUser, [state.activeUserId]: next }
  writeSettings(settingsByUser)
  return { ...next, settingsByUser }
}

export const useUiStore = create<UiState>((set) => ({
  ...DEFAULT_USER_SETTINGS,
  activeUserId: undefined,
  settingsByUser: {},
  activateUser: (email) => set((current) => {
    if (!email) return current.activeUserId === undefined
      ? current
      : { ...current, activeUserId: undefined, ...DEFAULT_USER_SETTINGS }
    const id = userId(email)
    const settingsByUser = readSettings()
    const settings = settingsByUser[id] ?? DEFAULT_USER_SETTINGS
    return { ...current, activeUserId: id, settingsByUser, ...settings }
  }),
  setMotionScale: (scale) => set((current) => applySetting(current, { motionScale: clampMotionScale(scale) })),
  setPageWidth: (width) => set((current) => applySetting(current, { pageWidth: clampPageWidth(width) })),
  setToolbarAnchor: (anchor) => set((current) => applySetting(current, { toolbarAnchor: anchor === 'bottom' ? 'bottom' : 'top' })),
}))

/** Test seam for deterministic persistence without touching ambient localStorage. */
export function setUiStorage(storage: Storage | null): void {
  storageOverride = storage
}
