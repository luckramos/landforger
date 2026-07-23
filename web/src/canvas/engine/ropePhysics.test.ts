import { describe, expect, it } from 'vitest'
import { createRope, isRopeAtRest, stepRope } from './ropePhysics'

describe('rope physics', () => {
  it('creates a rope of interior nodes between two endpoints', () => {
    const rope = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, 8)
    expect(rope.nodes.length).toBe(8)
    // Nodes start on the straight chord.
    expect(rope.nodes[0].y).toBeCloseTo(0)
  })

  it('sags downward under gravity after stepping', () => {
    let rope = createRope({ x: 0, y: 0 }, { x: 200, y: 0 }, 10)
    for (let i = 0; i < 40; i++) rope = stepRope(rope, { x: 0, y: 0 }, { x: 200, y: 0 })
    const maxY = Math.max(...rope.nodes.map((n) => n.y))
    expect(maxY).toBeGreaterThan(5) // hangs below the chord
  })

  it('settles to rest (velocities decay) when endpoints are still', () => {
    let rope = createRope({ x: 0, y: 0 }, { x: 200, y: 0 }, 10)
    for (let i = 0; i < 400; i++) rope = stepRope(rope, { x: 0, y: 0 }, { x: 200, y: 0 })
    expect(isRopeAtRest(rope)).toBe(true)
  })

  it('is NOT at rest immediately after an endpoint jump (it must swing)', () => {
    let rope = createRope({ x: 0, y: 0 }, { x: 200, y: 0 }, 10)
    for (let i = 0; i < 400; i++) rope = stepRope(rope, { x: 0, y: 0 }, { x: 200, y: 0 })
    // Move an endpoint sharply; the next step injects motion.
    rope = stepRope(rope, { x: 0, y: 0 }, { x: 200, y: 160 })
    rope = stepRope(rope, { x: 0, y: 0 }, { x: 200, y: 160 })
    expect(isRopeAtRest(rope)).toBe(false)
  })

  it('samples a polyline including both pinned endpoints', () => {
    const rope = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, 6)
    const line = rope.toPolyline({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(line[0]).toEqual({ x: 0, y: 0 })
    expect(line.at(-1)).toEqual({ x: 100, y: 0 })
    expect(line.length).toBe(8) // 2 endpoints + 6 interior
  })
})
