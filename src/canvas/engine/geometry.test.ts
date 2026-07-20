import { describe, expect, it } from 'vitest'
import type { CanvasItem } from '../types'
import {
  eraseAlongSegment,
  itemCenter,
  marqueeContains,
  pointInItem,
  rectFromPoints,
  resizeItem,
  rotationForPointer,
  screenToPage,
  zoomAt,
} from './geometry'

function sticky(overrides: Partial<CanvasItem> = {}): CanvasItem {
  return { id: 's', kind: 'sticky', x: 100, y: 100, width: 80, height: 40, rotation: 0, color: '#fff', text: '', ...overrides } as CanvasItem
}

describe('camera', () => {
  it('maps screen to page under pan and zoom, and back-computes zoom anchored at a point', () => {
    expect(screenToPage({ x: 120, y: 80 }, { panX: 20, panY: 0, zoom: 2 })).toEqual({ x: 50, y: 40 })
    const zoomed = zoomAt({ panX: 0, panY: 0, zoom: 1 }, { x: 100, y: 100 }, 2)
    // The page point under the anchor stays under the anchor after zoom.
    expect(screenToPage({ x: 100, y: 100 }, zoomed)).toEqual({ x: 100, y: 100 })
    expect(zoomed.zoom).toBe(2)
  })

  it('clamps zoom to sane bounds', () => {
    expect(zoomAt({ panX: 0, panY: 0, zoom: 1 }, { x: 0, y: 0 }, 99).zoom).toBeLessThanOrEqual(4)
    expect(zoomAt({ panX: 0, panY: 0, zoom: 1 }, { x: 0, y: 0 }, 0.001).zoom).toBeGreaterThan(0)
  })
})

describe('rectFromPoints', () => {
  it('normalizes to a positive rect regardless of drag direction', () => {
    expect(rectFromPoints({ x: 30, y: 40 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10, width: 20, height: 30 })
  })
})

describe('pointInItem (geometry-accurate, rotation-aware)', () => {
  it('hits inside the filled area and misses outside it', () => {
    const item = sticky()
    expect(pointInItem(item, { x: 140, y: 120 })).toBe(true)
    expect(pointInItem(item, { x: 90, y: 120 })).toBe(false)
  })

  it('respects rotation: a point outside the AABB but inside the rotated body still hits', () => {
    // 90°-rotated: the 80x40 box becomes 40 wide x 80 tall around its centre (140,120).
    const item = sticky({ rotation: 90 })
    expect(pointInItem(item, { x: 140, y: 155 })).toBe(true) // inside rotated body
    expect(pointInItem(item, { x: 175, y: 120 })).toBe(false) // was inside unrotated, now outside
  })
})

describe('marqueeContains (containment, not touch)', () => {
  const a = sticky({ id: 'a', x: 20, y: 20, width: 40, height: 40 })
  const b = sticky({ id: 'b', x: 200, y: 200, width: 40, height: 40 })
  it('selects only fully-enclosed items', () => {
    const box = rectFromPoints({ x: 0, y: 0 }, { x: 100, y: 100 })
    expect(marqueeContains([a, b], box)).toEqual(['a'])
  })
  it('excludes an item that merely overlaps the marquee', () => {
    const box = rectFromPoints({ x: 40, y: 40 }, { x: 120, y: 120 }) // clips corner of a
    expect(marqueeContains([a], box)).toEqual([])
  })
})

describe('resizeItem (8 handles, local-frame, aspect lock)', () => {
  it('grows from the SE handle and keeps the NW corner fixed (unrotated)', () => {
    const item = sticky({ x: 100, y: 100, width: 80, height: 40 })
    const next = resizeItem(item, 'se', { x: 220, y: 200 }, { aspect: false })
    expect(next.x).toBeCloseTo(100) // NW corner unmoved
    expect(next.y).toBeCloseTo(100)
    expect(next.width).toBeCloseTo(120)
    expect(next.height).toBeCloseTo(100)
  })

  it('the E handle changes width only and keeps the left edge fixed', () => {
    const item = sticky({ x: 100, y: 100, width: 80, height: 40 })
    const next = resizeItem(item, 'e', { x: 250, y: 999 }, { aspect: false })
    expect(next.x).toBeCloseTo(100)
    expect(next.height).toBeCloseTo(40)
    expect(next.width).toBeCloseTo(150)
  })

  it('aspect lock keeps the original ratio from a corner', () => {
    const item = sticky({ x: 100, y: 100, width: 80, height: 40 }) // ratio 2:1
    const next = resizeItem(item, 'se', { x: 300, y: 130 }, { aspect: true })
    expect(next.width / next.height).toBeCloseTo(2)
  })

  it('clamps to a minimum size', () => {
    const item = sticky({ x: 100, y: 100, width: 80, height: 40 })
    const next = resizeItem(item, 'se', { x: 100, y: 100 }, { aspect: false })
    expect(next.width).toBeGreaterThanOrEqual(1)
    expect(next.height).toBeGreaterThanOrEqual(1)
  })
})

describe('eraseAlongSegment (whole-item eraser)', () => {
  const note = sticky({ id: 'note', x: 100, y: 100, width: 80, height: 40 })
  const stroke: CanvasItem = {
    id: 'stroke', kind: 'stroke', x: 300, y: 300, width: 40, height: 40, rotation: 0, color: '#fff',
    points: [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 40, y: 40 }],
  }

  it('erases a rect item the pointer path crosses', () => {
    expect(eraseAlongSegment([note], { x: 90, y: 120 }, { x: 170, y: 120 }, 6)).toEqual(['note'])
  })

  it('erases a stroke the pointer path passes near (accounting for the item origin)', () => {
    // Segment near the stroke's world point (320,320).
    expect(eraseAlongSegment([stroke], { x: 318, y: 322 }, { x: 322, y: 318 }, 6)).toEqual(['stroke'])
  })

  it('leaves items the path misses', () => {
    expect(eraseAlongSegment([note, stroke], { x: 0, y: 0 }, { x: 10, y: 5 }, 6)).toEqual([])
  })
})

describe('rotationForPointer', () => {
  it('returns the angle in degrees from an item centre to the pointer, top = 0', () => {
    const item = sticky({ x: 100, y: 100, width: 80, height: 40 }) // centre 140,120
    // pointer directly right of centre → handle points down from top by 90°
    expect(Math.round(rotationForPointer(itemCenter(item), { x: 240, y: 120 }))).toBe(90)
  })
})
