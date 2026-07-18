import type { CanvasPoint } from './types'

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

/**
 * Quadratic-smoothed SVG path from sampled pencil points. Kept from the original
 * engine — freeform strokes (pencil, laser trail) reuse it. Pure and
 * kind-independent, so it survives the mood-board rebuild unchanged.
 */
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
