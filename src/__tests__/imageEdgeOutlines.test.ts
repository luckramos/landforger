import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The app is dark-only (--bg: #080807), so the hairline edge on images is a
// literal, not a token: outline: 1px solid oklch(1 0 0 / 0.1). This guards
// that Reader body images, the property lightbox image, and the Map Library
// preview all carry it, and that the corner-cropped Map inspector image
// follows its radius with an inset box-shadow instead (an outline would be
// clipped by the border-radius). See issue #60 / PRD #56.
const EDGE_OUTLINE = 'outline: 1px solid oklch(1 0 0 / 0.1)'
const EDGE_OUTLINE_OFFSET = 'outline-offset: -1px'
const EDGE_INSET_SHADOW = 'box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.1)'

describe('image edge outlines on the dark surface (#60)', () => {
  it('Reader body images (tiptap content) carry the hairline outline', () => {
    const css = readFileSync('src/editor/PageEditor.module.css', 'utf8')
    expect(css).toContain('.content :global(.tiptap img)')
    expect(css).toContain(EDGE_OUTLINE)
    expect(css).toContain(EDGE_OUTLINE_OFFSET)
  })

  it('the property lightbox image carries the hairline outline', () => {
    const css = readFileSync('src/properties/Properties.module.css', 'utf8')
    expect(css).toContain('.lightboxInner img')
    expect(css).toContain(EDGE_OUTLINE)
    expect(css).toContain(EDGE_OUTLINE_OFFSET)
  })

  it('the Map Library preview image carries the hairline outline', () => {
    const css = readFileSync('src/maps/MapLibrary.module.css', 'utf8')
    expect(css).toContain('.preview img')
    expect(css).toContain(EDGE_OUTLINE)
    expect(css).toContain(EDGE_OUTLINE_OFFSET)
  })

  it('the corner-cropped Map inspector image follows its radius with an inset box-shadow instead of an outline', () => {
    const css = readFileSync('src/maps/MapScreen.module.css', 'utf8')
    expect(css).toContain(EDGE_INSET_SHADOW)
    // An outline would be square and clipped by the border-radius, so this
    // treatment is deliberately the inset shadow, not the outline pattern.
    expect(css).not.toContain(EDGE_OUTLINE)
  })

  it('leaves the Reference Canvas colored 3px image frame untouched', () => {
    const css = readFileSync('src/canvas/ReferenceCanvasPanel.module.css', 'utf8')
    expect(css).toContain('.image { overflow: hidden; border: 3px solid color-mix(in oklab, var(--item-color) 80%, #fff); background: #19191c; box-shadow: 0 8px 30px rgba(0,0,0,.42); }')
    expect(css).not.toContain(EDGE_OUTLINE)
    expect(css).not.toContain(EDGE_INSET_SHADOW)
  })

  it('leaves the hairline-framed image tile untouched', () => {
    const css = readFileSync('src/properties/Properties.module.css', 'utf8')
    expect(css).toContain('border: 1px solid var(--hairline);\n  border-radius: 8px;')
    // The tile itself must not gain the new outline treatment — only the
    // lightbox image it opens into does.
    const tileBlockStart = css.indexOf('.imageTile {')
    const tileBlockEnd = css.indexOf('}', tileBlockStart)
    const tileBlock = css.slice(tileBlockStart, tileBlockEnd)
    expect(tileBlock).not.toContain(EDGE_OUTLINE)
  })
})
