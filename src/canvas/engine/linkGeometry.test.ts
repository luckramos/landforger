import { describe, expect, it } from 'vitest'
import type { CanvasItem } from '../types'
import { anchorPoint, catenaryPoints, distanceToPolyline, nearestAnchor } from './linkGeometry'

function sticky(overrides: Partial<CanvasItem> = {}): CanvasItem {
  return { id: 's', kind: 'sticky', x: 100, y: 100, width: 80, height: 40, rotation: 0, color: '#fff', text: '', ...overrides } as CanvasItem
}

describe('anchorPoint', () => {
  it('maps a normalized (u,v) anchor to a page-space point on the item box', () => {
    const item = sticky() // 100,100 → 180,140
    expect(anchorPoint(item, { u: 0, v: 0 })).toEqual({ x: 100, y: 100 })
    expect(anchorPoint(item, { u: 1, v: 1 })).toEqual({ x: 180, y: 140 })
    expect(anchorPoint(item, { u: 0.5, v: 0.5 })).toEqual({ x: 140, y: 120 })
  })

  it('accounts for rotation about the centre', () => {
    const item = sticky({ rotation: 90 }) // centre 140,120
    // top-centre (u:0.5,v:0) rotates 90° clockwise to the right-centre in page space
    const p = anchorPoint(item, { u: 0.5, v: 0 })
    expect(p.x).toBeCloseTo(160)
    expect(p.y).toBeCloseTo(120)
  })
})

describe('nearestAnchor', () => {
  it('picks the edge-midpoint anchor closest to a target point', () => {
    const item = sticky() // edges: left(0,.5) right(1,.5) top(.5,0) bottom(.5,1)
    expect(nearestAnchor(item, { x: 300, y: 120 })).toEqual({ u: 1, v: 0.5 }) // right
    expect(nearestAnchor(item, { x: 140, y: 0 })).toEqual({ u: 0.5, v: 0 }) // top
  })
})

describe('catenaryPoints', () => {
  it('sags below the straight chord midpoint (gravity pulls +y down)', () => {
    const pts = catenaryPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 16)
    const mid = pts[Math.floor(pts.length / 2)]
    expect(mid.y).toBeGreaterThan(0) // hangs down
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts.at(-1)).toEqual({ x: 100, y: 0 })
  })

  it('sags less when the endpoints are close (slack scales with distance)', () => {
    const near = catenaryPoints({ x: 0, y: 0 }, { x: 20, y: 0 }, 16)
    const far = catenaryPoints({ x: 0, y: 0 }, { x: 400, y: 0 }, 16)
    const nearSag = Math.max(...near.map((p) => p.y))
    const farSag = Math.max(...far.map((p) => p.y))
    expect(farSag).toBeGreaterThan(nearSag)
  })
})

describe('distanceToPolyline', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]
  it('is ~0 on the line and grows with perpendicular distance', () => {
    expect(distanceToPolyline({ x: 50, y: 0 }, line)).toBeCloseTo(0)
    expect(distanceToPolyline({ x: 50, y: 9 }, line)).toBeCloseTo(9)
  })
  it('supports a hit test with generous padding', () => {
    expect(distanceToPolyline({ x: 50, y: 8 }, line) <= 10).toBe(true)
    expect(distanceToPolyline({ x: 50, y: 40 }, line) <= 10).toBe(false)
  })
})
