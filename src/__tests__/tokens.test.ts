import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync('src/styles/tokens.css', 'utf8')

type Rgba = { r: number; g: number; b: number; a: number }

/** Reads a custom property's raw value out of the tokens.css text. */
function readToken(name: string): string {
  const match = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`token --${name} not found in tokens.css`)
  return match[1].trim()
}

/** Parses a hex or rgb(a) color literal — the notation tokens.css uses today. */
function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/,
  )
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] !== undefined ? Number(rgb[4]) : 1,
    }
  }
  throw new Error(`unsupported color notation: ${value}`)
}

/** Parses the current value of a token straight out of tokens.css. */
function token(name: string): Rgba {
  return parseColor(readToken(name))
}

/** Alpha-composites a (possibly translucent) foreground over an opaque background (Porter-Duff "over"). */
function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
    a: 1,
  }
}

/** WCAG relative luminance, per https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function relativeLuminance({ r, g, b }: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio between two opaque colors — 1:1 (none) to 21:1 (max). */
function contrastRatio(a: Rgba, b: Rgba): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Contrast of a token's foreground (composited over `bg` if translucent) against that same bg. */
function contrastOf(tokenName: string, bg: Rgba): number {
  return contrastRatio(compositeOver(token(tokenName), bg), bg)
}

const WCAG_AA_TEXT = 4.5

describe('design tokens match the measured design values', () => {
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

  describe('color contrast', () => {
    // These read the tokens' actual current values rather than pinning hex/rgba
    // substrings, so a faithful OKLCH conversion (or any other value tweak that
    // preserves legibility) keeps this suite green — only an actual contrast
    // regression fails it.
    const bg = token('bg')
    const panel3 = token('panel-3')
    const bronze = token('bronze')
    const bronzeLight = token('bronze-light')

    const textTokens = ['text-hi', 'text', 'text-dim', 'text-faint']

    it.each(textTokens)('--%s clears the 4.5:1 floor against --bg', (name) => {
      expect(contrastOf(name, bg)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    })

    it.each(textTokens)(
      '--%s clears the 4.5:1 floor against --panel-3 (the lighter surface, thinnest margin)',
      (name) => {
        expect(contrastOf(name, panel3)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
      },
    )

    // Promotes tokens.css's --text-faint contrast reasoning from a comment into
    // an executed assertion — the review's open question about the 0.5α faint
    // label staying legible on the lighter panel.
    it('--text-faint (0.5 alpha) clears 4.5:1 on --panel-3', () => {
      expect(contrastOf('text-faint', panel3)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    })

    it('--bronze-light clears the 4.5:1 floor against --bg and --panel-3', () => {
      expect(contrastRatio(bronzeLight, bg)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
      expect(contrastRatio(bronzeLight, panel3)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    })

    it('--on-bronze clears the 4.5:1 floor against both ends of its button gradient (--bronze, --bronze-light)', () => {
      const onBronze = token('on-bronze')
      expect(contrastRatio(onBronze, bronze)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
      expect(contrastRatio(onBronze, bronzeLight)).toBeGreaterThanOrEqual(WCAG_AA_TEXT)
    })
  })

  it('defines --bronze-hi as a real value, guarding against the invisible-variable bug (issue #78)', () => {
    // --bronze-hi was referenced 5x (Canvas selection ring/shape-preview, Graph
    // scope toggle) but never defined, so those declarations were invalid at
    // computed-value time. Assert an actual definition — not just any mention
    // of the substring "--bronze-hi" (a var() call site would also match).
    expect(tokens).toMatch(/--bronze-hi:\s*\S+/)
  })
})
