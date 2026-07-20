import { describe, expect, it } from 'vitest'
import { clampOklch, formatOklch, parseOklch } from './color'

describe('oklch color helpers', () => {
  it('formats to a canonical, rounded oklch() string', () => {
    expect(formatOklch({ l: 0.7123, c: 0.1289, h: 25.44 })).toBe('oklch(0.712 0.129 25.4)')
  })

  it('round-trips through parse/format', () => {
    const parsed = parseOklch('oklch(0.75 0.09 70)')
    expect(parsed).toEqual({ l: 0.75, c: 0.09, h: 70 })
    expect(formatOklch(parsed!)).toBe('oklch(0.75 0.09 70)')
  })

  it('returns null for non-oklch strings', () => {
    expect(parseOklch('#d8aa61')).toBeNull()
    expect(parseOklch('rgb(1,2,3)')).toBeNull()
  })

  it('clamps channels into range and wraps hue', () => {
    expect(clampOklch({ l: 1.4, c: 0.9, h: 400 })).toEqual({ l: 1, c: 0.37, h: 40 })
    expect(clampOklch({ l: -0.2, c: -0.1, h: -30 })).toEqual({ l: 0, c: 0, h: 330 })
  })
})
