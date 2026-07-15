import { create } from 'zustand'

export interface UserSettings {
  /** Motion scale — multiply-is-slower; written to `--mo` on the app root. */
  motionScale: number
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  motionScale: 1,
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

function normalizeSettings(value: unknown): UserSettings {
  const candidate = value && typeof value === 'object' ? value as Partial<UserSettings> : {}
  return {
    motionScale: clampMotionScale(Number(candidate.motionScale)),
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
  setMotionScale: (scale) => set((current) => {
    const motionScale = clampMotionScale(scale)
    if (!current.activeUserId) return { ...current, motionScale }
    const settingsByUser = {
      ...current.settingsByUser,
      [current.activeUserId]: { motionScale },
    }
    writeSettings(settingsByUser)
    return { ...current, motionScale, settingsByUser }
  }),
}))

/** Test seam for deterministic persistence without touching ambient localStorage. */
export function setUiStorage(storage: Storage | null): void {
  storageOverride = storage
}
