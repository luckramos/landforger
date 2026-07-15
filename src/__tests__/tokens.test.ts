import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync('src/styles/tokens.css', 'utf8')

describe('design tokens match the measured design values', () => {
  it('carries the surface and accent colors', () => {
    for (const value of ['#080807', '#100e0c', '#0e0d0c', '#181614', '#b0824a', '#e6c79a']) {
      expect(tokens).toContain(value)
    }
  })

  it('carries all 7 category colors with the measured oklch hues', () => {
    expect(tokens).toContain('oklch(0.8 0.085 215)') // stories
    expect(tokens).toContain('oklch(0.8 0.085 300)') // eras
    expect(tokens).toContain('oklch(0.8 0.085 32)') // characters
    expect(tokens).toContain('oklch(0.8 0.085 152)') // locations
    expect(tokens).toContain('oklch(0.83 0.085 92)') // items (L 0.83)
    expect(tokens).toContain('oklch(0.79 0.085 268)') // organizations (L 0.79)
    expect(tokens).toContain('oklch(0.8 0.085 332)') // events
  })

  it('carries the sans and mono font families', () => {
    for (const font of ['Onest', 'IBM Plex Mono']) {
      expect(tokens).toContain(font)
    }
  })

  it('carries the complete measured easing set', () => {
    for (const curve of [
      'cubic-bezier(0.22, 0.61, 0.36, 1)',
      'cubic-bezier(0.76, 0, 0.24, 1)',
      'cubic-bezier(0.5, 0, 0.2, 1)',
      'cubic-bezier(0.4, 0, 0.2, 1)',
      'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
      'cubic-bezier(0.34, 1.56, 0.64, 1)',
      'cubic-bezier(0.34, 1.42, 0.5, 1)',
    ]) {
      expect(tokens).toContain(curve)
    }
  })

  it('declares the motion scale', () => {
    expect(tokens).toContain('--mo: 1')
  })

  it('pins --text-faint at alpha 0.5 so informative text clears the WCAG contrast floor', () => {
    // Was rgba(245, 241, 234, 0.35) ≈ 2.9:1 against --bg (#080807) — below the 3:1 floor.
    // At 0.5 it blends to ~rgb(126.5, 124.5, 120.5), which is ≈4.84:1 against --bg (≥ 4:1 target).
    expect(tokens).toContain('--text-faint: rgba(245, 241, 234, 0.5)')
    expect(tokens).not.toContain('--text-faint: rgba(245, 241, 234, 0.35)')
  })

  it('keeps a separate decorative-only token at the old low-contrast alpha for non-text ornament', () => {
    expect(tokens).toContain('--ornament-faint: rgba(245, 241, 234, 0.35)')
  })
})
