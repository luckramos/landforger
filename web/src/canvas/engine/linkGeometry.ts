import type { CanvasItem, CanvasPoint, LinkAnchor } from '../types'
import { itemCenter } from './geometry'

/** Page-space point for a normalized anchor on an item's (possibly rotated) box. */
export function anchorPoint(item: CanvasItem, anchor: LinkAnchor): CanvasPoint {
  const local = { x: item.x + anchor.u * item.width, y: item.y + anchor.v * item.height }
  if (!item.rotation) return local
  const center = itemCenter(item)
  const rad = (item.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = local.x - center.x
  const dy = local.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

/** The four edge-midpoint anchors an item exposes as connection nubs. */
export const EDGE_ANCHORS: LinkAnchor[] = [
  { u: 0.5, v: 0 }, // top
  { u: 1, v: 0.5 }, // right
  { u: 0.5, v: 1 }, // bottom
  { u: 0, v: 0.5 }, // left
]

/** The edge-midpoint anchor whose page point is closest to `target`. */
export function nearestAnchor(item: CanvasItem, target: CanvasPoint): LinkAnchor {
  let best = EDGE_ANCHORS[0]
  let bestDist = Infinity
  for (const anchor of EDGE_ANCHORS) {
    const point = anchorPoint(item, anchor)
    const dist = Math.hypot(point.x - target.x, point.y - target.y)
    if (dist < bestDist) {
      bestDist = dist
      best = anchor
    }
  }
  return best
}

/**
 * Sample a hanging-string curve (static catenary approximation) between two
 * page points. A quadratic through a sagged midpoint — gravity pulls +y down —
 * with sag scaled to the chord length (short strings barely sag, long ones droop).
 * Returns `segments + 1` points. This is the resting curve used when physics is
 * idle or under `prefers-reduced-motion`.
 */
export function catenaryPoints(from: CanvasPoint, to: CanvasPoint, segments = 16): CanvasPoint[] {
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const sag = Math.min(120, dist * 0.2)
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2 + sag
  // Control point for a quadratic Bézier whose apex passes through (midX, midY).
  const ctrl = { x: 2 * midX - (from.x + to.x) / 2, y: 2 * midY - (from.y + to.y) / 2 }
  const points: CanvasPoint[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const mt = 1 - t
    points.push({
      x: mt * mt * from.x + 2 * mt * t * ctrl.x + t * t * to.x,
      y: mt * mt * from.y + 2 * mt * t * ctrl.y + t * t * to.y,
    })
  }
  return points
}

function pointSegmentDistance(p: CanvasPoint, a: CanvasPoint, b: CanvasPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Shortest distance from `point` to a polyline (the string's sampled curve). */
export function distanceToPolyline(point: CanvasPoint, polyline: readonly CanvasPoint[]): number {
  let best = Infinity
  for (let i = 1; i < polyline.length; i++) {
    best = Math.min(best, pointSegmentDistance(point, polyline[i - 1], polyline[i]))
  }
  return best
}

/** An SVG path `d` through the sampled points (straight segments — the sampling is the curve). */
export function polylinePath(points: readonly CanvasPoint[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
}
