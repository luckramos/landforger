import type { CanvasItem, CanvasPoint, CanvasRect, CanvasViewport } from '../types'

export const MIN_ITEM_SIZE = 24
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4

// --- Camera ---

export function screenToPage(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  }
}

/** Zoom to `nextZoom` while keeping the page point under `anchor` (screen space) fixed. */
export function zoomAt(viewport: CanvasViewport, anchor: CanvasPoint, nextZoom: number): CanvasViewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
  const page = screenToPage(anchor, viewport)
  return { zoom, panX: anchor.x - page.x * zoom, panY: anchor.y - page.y * zoom }
}

// --- Rects & rotation ---

export function rectFromPoints(a: CanvasPoint, b: CanvasPoint): CanvasRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

export function itemCenter(item: CanvasItem): CanvasPoint {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Rotate `point` about `origin` by `degrees` (clockwise in screen coordinates). */
function rotateAbout(point: CanvasPoint, origin: CanvasPoint, degrees: number): CanvasPoint {
  const rad = toRadians(degrees)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

/** The item's four corners in page space, accounting for rotation. */
export function itemCorners(item: CanvasItem): CanvasPoint[] {
  const center = itemCenter(item)
  const corners = [
    { x: item.x, y: item.y },
    { x: item.x + item.width, y: item.y },
    { x: item.x + item.width, y: item.y + item.height },
    { x: item.x, y: item.y + item.height },
  ]
  return item.rotation ? corners.map((corner) => rotateAbout(corner, center, item.rotation)) : corners
}

/** Geometry-accurate hit test: is `point` within the item's (possibly rotated) body? */
export function pointInItem(item: CanvasItem, point: CanvasPoint): boolean {
  const center = itemCenter(item)
  // Bring the point into the item's local, unrotated frame.
  const local = item.rotation ? rotateAbout(point, center, -item.rotation) : point
  return (
    local.x >= item.x &&
    local.x <= item.x + item.width &&
    local.y >= item.y &&
    local.y <= item.y + item.height
  )
}

function rectContainsPoint(rect: CanvasRect, point: CanvasPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/** Ids of items fully enclosed by the marquee rect (containment, not touch). */
export function marqueeContains(items: readonly CanvasItem[], marquee: CanvasRect): string[] {
  return items
    .filter((item) => itemCorners(item).every((corner) => rectContainsPoint(marquee, corner)))
    .map((item) => item.id)
}

// --- Resize ---

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface ResizeOptions {
  aspect: boolean
}

/**
 * Resize `item` so the given `handle` follows `pointer` (page space) while the
 * opposite edge/corner stays fixed. The pointer delta is projected into the
 * item's local (unrotated) frame, so resize respects rotation. Adapted from the
 * shape-util resize pattern — our own implementation.
 */
export function resizeItem(item: CanvasItem, handle: ResizeHandle, pointer: CanvasPoint, options: ResizeOptions): CanvasItem {
  const center = itemCenter(item)
  const rad = toRadians(item.rotation)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  // Pointer in the item's local frame, relative to centre.
  const dx = pointer.x - center.x
  const dy = pointer.y - center.y
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos

  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0

  const halfW = item.width / 2
  const halfH = item.height / 2

  // The fixed edge sits at the opposite side in local space.
  const fixedLocalX = sx !== 0 ? -sx * halfW : 0
  const fixedLocalY = sy !== 0 ? -sy * halfH : 0

  let width = item.width
  let height = item.height
  if (sx !== 0) width = Math.max(MIN_ITEM_SIZE, sx * (localX - fixedLocalX))
  if (sy !== 0) height = Math.max(MIN_ITEM_SIZE, sy * (localY - fixedLocalY))

  if (options.aspect && sx !== 0 && sy !== 0) {
    const ratio = item.width / item.height
    // Drive both dimensions by the larger relative change so the ratio holds.
    if (width / item.width > height / item.height) height = width / ratio
    else width = height * ratio
  }

  // Keep the anchor (fixed edge/corner) pinned in page space.
  const anchorPage = {
    x: center.x + (fixedLocalX * cos - fixedLocalY * sin),
    y: center.y + (fixedLocalX * sin + fixedLocalY * cos),
  }
  const newFixedLocalX = sx !== 0 ? -sx * (width / 2) : 0
  const newFixedLocalY = sy !== 0 ? -sy * (height / 2) : 0
  const newCenter = {
    x: anchorPage.x - (newFixedLocalX * cos - newFixedLocalY * sin),
    y: anchorPage.y - (newFixedLocalX * sin + newFixedLocalY * cos),
  }

  return { ...item, width, height, x: newCenter.x - width / 2, y: newCenter.y - height / 2 }
}

/** Degrees from an item centre to the pointer, with straight-up as 0. */
export function rotationForPointer(center: CanvasPoint, pointer: CanvasPoint): number {
  const angle = Math.atan2(pointer.x - center.x, center.y - pointer.y) * (180 / Math.PI)
  return (angle + 360) % 360
}
