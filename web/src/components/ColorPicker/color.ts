/**
 * Small, dependency-free color conversions for the from-scratch ColorPicker.
 * The picker's internal source of truth is HSV (ergonomic for a saturation/
 * brightness field + hue rail); the outside world speaks hex (what WorldCard's
 * `--card-color` and CreateWorldInput.color already consume).
 */

export interface Hsv {
  /** Hue, 0–360. */
  h: number
  /** Saturation, 0–100. */
  s: number
  /** Value/brightness, 0–100. */
  v: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const sat = s / 100
  const val = v / 100
  const c = val * sat
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = val - c
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** HSV → `#rrggbb` (lowercase). */
export function hsvToHex(hsv: Hsv): string {
  const [r, g, b] = hsvToRgb(hsv)
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
}

/** Accepts `#abc`, `#aabbcc`, or the same without `#`. Returns null if unparseable. */
export function parseHex(input: string): [number, number, number] | null {
  const hex = input.trim().replace(/^#/, '')
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [full.slice(0, 2), full.slice(2, 4), full.slice(4, 6)].map((h) => parseInt(h, 16)) as [
    number,
    number,
    number,
  ]
}

/** Hex → HSV. `keepHue` is preserved when the color is achromatic (grey/black/white),
 *  so dragging brightness to zero doesn't fling the hue rail back to red. */
export function hexToHsv(input: string, keepHue = 0): Hsv {
  const rgb = parseHex(input)
  if (!rgb) return { h: keepHue, s: 0, v: 0 }
  const [r, g, b] = rgb.map((n) => n / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = keepHue
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  const s = max === 0 ? 0 : (d / max) * 100
  return { h: clamp(h, 0, 360), s: clamp(s, 0, 100), v: clamp(max * 100, 0, 100) }
}
