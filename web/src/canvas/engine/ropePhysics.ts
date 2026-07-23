import type { CanvasPoint } from '../types'

/**
 * A verlet-integrated rope hanging between two pinned endpoints. Interior nodes
 * carry position + previous position (velocity is their difference); gravity
 * pulls them down and distance constraints hold the string together, so it
 * swings and settles like real string. Pure: `stepRope` returns the next state,
 * so a shared rAF driver can advance many ropes without per-rope timers.
 */
export interface RopeNode {
  x: number
  y: number
  px: number
  py: number
}
export interface Rope {
  nodes: RopeNode[]
  /** Rest length between adjacent nodes (chord length / segments). */
  segment: number
  /** Full curve including the two live endpoints. */
  toPolyline(from: CanvasPoint, to: CanvasPoint): CanvasPoint[]
}

const GRAVITY = 0.5
const DAMPING = 0.92
const CONSTRAINT_ITERATIONS = 8
const SLACK = 1.18 // rest length slightly longer than the chord so the string sags
const REST_EPSILON = 0.05

/** Build a rope of `count` interior nodes on the straight chord between the endpoints. */
export function createRope(from: CanvasPoint, to: CanvasPoint, count = 12): Rope {
  const nodes: RopeNode[] = []
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1)
    const x = from.x + (to.x - from.x) * t
    const y = from.y + (to.y - from.y) * t
    nodes.push({ x, y, px: x, py: y })
  }
  const chord = Math.hypot(to.x - from.x, to.y - from.y)
  return { nodes, segment: (chord / (count + 1)) * SLACK, toPolyline: makePolyline(nodes) }
}

function makePolyline(nodes: RopeNode[]) {
  return (from: CanvasPoint, to: CanvasPoint): CanvasPoint[] => [
    { x: from.x, y: from.y },
    ...nodes.map((n) => ({ x: n.x, y: n.y })),
    { x: to.x, y: to.y },
  ]
}

/** Advance the rope one tick with the endpoints pinned at `from`/`to`. */
export function stepRope(rope: Rope, from: CanvasPoint, to: CanvasPoint): Rope {
  const nodes = rope.nodes.map((n) => {
    // Verlet integration with damping + gravity.
    const vx = (n.x - n.px) * DAMPING
    const vy = (n.y - n.py) * DAMPING
    return { x: n.x + vx, y: n.y + vy + GRAVITY, px: n.x, py: n.y }
  })

  const chord = Math.hypot(to.x - from.x, to.y - from.y)
  const count = nodes.length
  const segment = (chord / (count + 1)) * SLACK
  // Satisfy distance constraints between pinned endpoints and interior nodes.
  for (let iter = 0; iter < CONSTRAINT_ITERATIONS; iter++) {
    for (let i = 0; i <= count; i++) {
      const a = i === 0 ? from : nodes[i - 1]
      const b = i === count ? to : nodes[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 0.0001
      const diff = (dist - segment) / dist
      const offX = dx * 0.5 * diff
      const offY = dy * 0.5 * diff
      if (i !== 0) { nodes[i - 1].x += offX; nodes[i - 1].y += offY }
      if (i !== count) { nodes[i].x -= offX; nodes[i].y -= offY }
    }
  }
  return { nodes, segment, toPolyline: makePolyline(nodes) }
}

/** True when every node's velocity has decayed below the rest threshold. */
export function isRopeAtRest(rope: Rope): boolean {
  return rope.nodes.every((n) => Math.abs(n.x - n.px) < REST_EPSILON && Math.abs(n.y - n.py) < REST_EPSILON)
}
