import { describe, expect, it } from 'vitest'
import { hexToHsv, hsvToHex, parseHex } from '../color'

describe('color conversions', () => {
  it('round-trips the six primary/secondary corners through HSV → hex', () => {
    expect(hsvToHex({ h: 0, s: 100, v: 100 })).toBe('#ff0000')
    expect(hsvToHex({ h: 120, s: 100, v: 100 })).toBe('#00ff00')
    expect(hsvToHex({ h: 240, s: 100, v: 100 })).toBe('#0000ff')
    expect(hsvToHex({ h: 60, s: 100, v: 100 })).toBe('#ffff00')
    expect(hsvToHex({ h: 0, s: 0, v: 100 })).toBe('#ffffff')
    expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe('#000000')
  })

  it('parses #rrggbb, #rgb, and bare hex; rejects garbage', () => {
    expect(parseHex('#b0824a')).toEqual([176, 130, 74])
    expect(parseHex('b0824a')).toEqual([176, 130, 74])
    expect(parseHex('#abc')).toEqual([170, 187, 204])
    expect(parseHex('nope')).toBeNull()
    expect(parseHex('#12')).toBeNull()
  })

  it('preserves the incoming hue when the color is achromatic (grey/black)', () => {
    // Dragging brightness to black must not fling the hue rail back to 0.
    expect(hexToHsv('#000000', 210).h).toBe(210)
    expect(hexToHsv('#808080', 42).h).toBe(42)
  })

  it('recovers a stable hue from a saturated color and round-trips it', () => {
    const hsv = hexToHsv('#b0824a')
    expect(hsv.h).toBeGreaterThan(30)
    expect(hsv.h).toBeLessThan(36)
    expect(hsvToHex(hsv)).toBe('#b0824a')
  })
})
