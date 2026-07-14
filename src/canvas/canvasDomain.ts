import type { CanvasItem, CanvasPoint, CanvasRect, CanvasViewport } from './types'

export const CANVAS_GRID_SIZE = 8

export function snapToGrid(value: number, grid = CANVAS_GRID_SIZE): number {
  return Math.round(value / grid) * grid
}

export function snapRectToGrid(rect: CanvasRect): CanvasRect {
  return {
    x: snapToGrid(rect.x),
    y: snapToGrid(rect.y),
    width: Math.max(CANVAS_GRID_SIZE, snapToGrid(rect.width)),
    height: Math.max(CANVAS_GRID_SIZE, snapToGrid(rect.height)),
  }
}

export function screenToCanvasPoint(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  }
}

export function zoomViewportAt(viewport: CanvasViewport, anchor: CanvasPoint, nextZoom: number): CanvasViewport {
  const zoom = Math.min(2.5, Math.max(0.35, nextZoom))
  const worldPoint = screenToCanvasPoint(anchor, viewport)
  return {
    panX: anchor.x - worldPoint.x * zoom,
    panY: anchor.y - worldPoint.y * zoom,
    zoom,
  }
}

export function normalizeRect(from: CanvasPoint, to: CanvasPoint): CanvasRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  }
}

function intersects(a: CanvasRect, b: CanvasRect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

export function marqueeSelection(items: readonly CanvasItem[], marquee: CanvasRect): string[] {
  return items.filter((item) => intersects(item, marquee)).map((item) => item.id)
}

function pointSegmentDistance(point: CanvasPoint, from: CanvasPoint, to: CanvasPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - from.x, point.y - from.y)
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy))
}

function orientation(a: CanvasPoint, b: CanvasPoint, c: CanvasPoint): number {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y))
}

function segmentsIntersect(a: CanvasPoint, b: CanvasPoint, c: CanvasPoint, d: CanvasPoint): boolean {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b)
}

function segmentsDistance(a: CanvasPoint, b: CanvasPoint, c: CanvasPoint, d: CanvasPoint): number {
  if (segmentsIntersect(a, b, c, d)) return 0
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b))
}

function rectHitBySegment(rect: CanvasRect, from: CanvasPoint, to: CanvasPoint, tolerance: number): boolean {
  const expanded = { x: rect.x - tolerance, y: rect.y - tolerance, width: rect.width + tolerance * 2, height: rect.height + tolerance * 2 }
  if (
    (from.x >= expanded.x && from.x <= expanded.x + expanded.width && from.y >= expanded.y && from.y <= expanded.y + expanded.height) ||
    (to.x >= expanded.x && to.x <= expanded.x + expanded.width && to.y >= expanded.y && to.y <= expanded.y + expanded.height)
  ) return true
  const corners = [
    { x: expanded.x, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
    { x: expanded.x, y: expanded.y + expanded.height },
  ]
  return corners.some((corner, index) => segmentsIntersect(from, to, corner, corners[(index + 1) % corners.length]))
}

function strokeHit(item: Extract<CanvasItem, { kind: 'stroke' }>, from: CanvasPoint, to: CanvasPoint, tolerance: number): boolean {
  const points = item.points.map((point) => ({ x: item.x + point.x, y: item.y + point.y }))
  if (points.length === 1) return pointSegmentDistance(points[0], from, to) <= tolerance
  return points.slice(1).some((point, index) => segmentsDistance(points[index], point, from, to) <= tolerance)
}

export function eraseItemsAlongSegment(
  items: readonly CanvasItem[],
  from: CanvasPoint,
  to: CanvasPoint,
  tolerance = 7,
): CanvasItem[] {
  return items.filter((item) => item.kind === 'stroke' ? !strokeHit(item, from, to, tolerance) : !rectHitBySegment(item, from, to, tolerance))
}

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

export function smoothStrokePath(points: readonly CanvasPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${formatSvgNumber(points[0].x)} ${formatSvgNumber(points[0].y)}`
  if (points.length === 2) return `M ${formatSvgNumber(points[0].x)} ${formatSvgNumber(points[0].y)} L ${formatSvgNumber(points[1].x)} ${formatSvgNumber(points[1].y)}`
  const parts = [`M ${formatSvgNumber(points[0].x)} ${formatSvgNumber(points[0].y)}`]
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]
    const next = points[index + 1]
    parts.push(`Q ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)} ${formatSvgNumber((point.x + next.x) / 2)} ${formatSvgNumber((point.y + next.y) / 2)}`)
  }
  const last = points.at(-1) as CanvasPoint
  parts.push(`L ${formatSvgNumber(last.x)} ${formatSvgNumber(last.y)}`)
  return parts.join(' ')
}
