import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// CSS-content seam (prior art: motion.test.tsx, tokens.test.ts) — this repo's
// suite runs in happy-dom, which has no layout engine, so a rendered
// border-radius can't be measured. Instead we assert the design rule that
// produces the concentric relationship: outer = inner + padding, expressed
// as a token-derived calc() rather than a pair of magic literals that can
// silently drift apart.

const tokens = readFileSync('src/styles/tokens.css', 'utf8')

/** Pulls a `--radius-xxx: Npx` value out of tokens.css as a number. */
function radiusToken(name: string): number {
  const match = tokens.match(new RegExp(`--radius-${name}:\\s*([\\d.]+)px`))
  if (!match) throw new Error(`--radius-${name} not found in tokens.css`)
  return Number(match[1])
}

/** Pulls a local `--foo: Npx` custom property value out of a CSS blob. */
function localVar(css: string, name: string): number {
  const match = css.match(new RegExp(`--${name}:\\s*([\\d.]+)px`))
  if (!match) throw new Error(`--${name} not found`)
  return Number(match[1])
}

describe('concentric radii — outer = inner + padding (#64)', () => {
  it('declares the radius scale this suite verifies against', () => {
    expect(radiusToken('xs')).toBe(6)
    expect(radiusToken('sm')).toBe(8)
    expect(radiusToken('md')).toBe(12)
    expect(radiusToken('card')).toBe(14)
  })

  it('User Menu: popover radius = item radius + --menu-pad', () => {
    const css = readFileSync('src/components/UserMenu/UserMenu.module.css', 'utf8')

    expect(css).toContain('border-radius: var(--radius-md);')
    expect(css).toContain('border-radius: calc(var(--radius-md) - var(--menu-pad));')

    const pad = localVar(css, 'menu-pad')
    const outer = radiusToken('md')
    // The item's radius is the calc expression itself; verify the arithmetic
    // it encodes actually resolves to a smaller, valid inner radius.
    expect(outer - pad).toBe(radiusToken('xs'))
    expect(outer).toBe(pad + (outer - pad))

    // The old mismatched magic literals (outer 12px vs. item 8px, whose sum
    // with the 6px padding never matched) must be gone.
    expect(css).not.toContain('border-radius: 12px;')
    expect(css).not.toContain('border-radius: 8px;\n  background: transparent;')
  })

  it('Canvas shape picker: outer radius = button radius + --picker-pad', () => {
    const css = readFileSync('src/canvas/ReferenceCanvasPanel.module.css', 'utf8')

    expect(css).toContain('border-radius: var(--radius-xs);')
    expect(css).toContain('border-radius: calc(var(--radius-xs) + var(--picker-pad));')

    const pad = localVar(css, 'picker-pad')
    const inner = radiusToken('xs')
    expect(inner + pad).toBe(14)

    // Old magic literals: 9px outer, 6px shared tool/swatch button radius.
    expect(css).not.toContain('border-radius: 9px;')
    expect(css).not.toContain('border-radius: 6px;')
  })

  it('Graph scope toggle: outer radius = button radius + --toggle-pad', () => {
    const css = readFileSync('src/graph/GraphPanel.module.css', 'utf8')

    expect(css).toContain('border-radius: var(--radius-sm);')
    expect(css).toContain('border-radius: calc(var(--radius-sm) - var(--toggle-pad));')

    const pad = localVar(css, 'toggle-pad')
    const outer = radiusToken('sm')
    expect(outer - pad).toBe(6)

    // Old mismatched magic literals: 8px outer vs. a 5px button (8 !== 5 + 2).
    expect(css).not.toContain('border-radius: 5px;')
  })
})

describe('opportunistic radius-token derivation (#64, extends #43)', () => {
  it('cardHover: the dashed ring radius derives from --radius-card, not 15.5px', () => {
    const css = readFileSync('src/styles/cardHover.module.css', 'utf8')
    expect(css).toContain('border-radius: calc(var(--radius-card) + 1.5px);')
    expect(css).not.toContain('15.5px')
    expect(radiusToken('card') + 1.5).toBe(15.5)
  })

  it('Worlds: pill search and dashed create-card radii use tokens, not 999px/14px', () => {
    const css = readFileSync('src/screens/Worlds/Worlds.module.css', 'utf8')
    expect(css).toContain('border-radius: var(--radius-pill);')
    expect(css).toContain('border-radius: var(--radius-card);')
    expect(css).not.toContain('border-radius: 999px;')
    expect(css).not.toContain('border-radius: 14px;')
  })

  it('WorldCard: card and genre badge radii use tokens, not 14px/999px', () => {
    const css = readFileSync('src/screens/Worlds/WorldCard.module.css', 'utf8')
    expect(css).toContain('border-radius: var(--radius-card);')
    expect(css).toContain('border-radius: var(--radius-pill);')
    expect(css).not.toContain('border-radius: 14px;')
    expect(css).not.toContain('border-radius: 999px;')
  })

  it('SpotlightSearch: panel radius uses --radius-card, not the 14px literal', () => {
    const css = readFileSync('src/screens/Dashboard/SpotlightSearch.module.css', 'utf8')
    expect(css).toContain('border-radius: var(--radius-card);')
    expect(css).not.toContain('border-radius: 14px;')
  })
})
