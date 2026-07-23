/**
 * OKLCH color model for the canvas color picker (ADR 0004: theme colors are
 * authored in OKLCH). The picker is bespoke — no native `<input type="color">`,
 * no third-party library — so it works directly in these three channels.
 */
export interface Oklch {
  /** Lightness 0–1. */
  l: number
  /** Chroma 0–CHROMA_MAX. */
  c: number
  /** Hue 0–360 degrees. */
  h: number
}

export const CHROMA_MAX = 0.37

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** Serialize to a canonical `oklch(L C H)` string. */
export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${round(l, 3)} ${round(c, 3)} ${round(h, 1)})`
}

/** Parse a canonical `oklch(L C H)` string, or null if it isn't one. */
export function parseOklch(value: string): Oklch | null {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/)
  if (!match) return null
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function clampOklch({ l, c, h }: Oklch): Oklch {
  return { l: clamp(l, 0, 1), c: clamp(c, 0, CHROMA_MAX), h: (h % 360 + 360) % 360 }
}

/** A sensible starting color for the canvas (a warm mid-bronze) — channels and string. */
export const DEFAULT_CANVAS_OKLCH: Oklch = { l: 0.75, c: 0.09, h: 70 }
export const DEFAULT_CANVAS_COLOR = formatOklch(DEFAULT_CANVAS_OKLCH)
