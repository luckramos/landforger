import type { CanvasItem, CanvasItemKind, CanvasPoint } from '../types'

/**
 * Per-kind registry adapted from tldraw's shape-util pattern (our own code):
 * each kind declares its default size, label, and whether it holds editable
 * text. Rendering differences (a transparent text label vs. a tinted sticky
 * card) are driven by `data-kind` in CSS, so the registry stays data-only.
 * A new kind is mostly additive — an entry here plus its codec case and default
 * colour — rather than growing a render switch inside the panel.
 */
interface ItemKindDef {
  label: string
  defaultWidth: number
  defaultHeight: number
  editable: boolean
  placeholder: string
}

export const ITEM_KINDS: Record<CanvasItemKind, ItemKindDef> = {
  text: { label: 'Text', defaultWidth: 220, defaultHeight: 44, editable: true, placeholder: 'Type…' },
  sticky: { label: 'Sticky note', defaultWidth: 200, defaultHeight: 144, editable: true, placeholder: 'Write a note…' },
  // Strokes are drawn freehand (see the pencil tool), not click-created, so the
  // default size is unused; they hold no editable text.
  stroke: { label: 'Stroke', defaultWidth: 0, defaultHeight: 0, editable: false, placeholder: '' },
}

let counter = 0

export function makeItemId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `canvas-${crypto.randomUUID()}`
  counter += 1
  return `canvas-item-${counter}`
}

/** Create a click-placed item (text/sticky) centred on `at`, using registry defaults. */
export function createItem(kind: 'text' | 'sticky', at: CanvasPoint, color: string): CanvasItem {
  const def = ITEM_KINDS[kind]
  const base = {
    id: makeItemId(),
    x: at.x - def.defaultWidth / 2,
    y: at.y - def.defaultHeight / 2,
    width: def.defaultWidth,
    height: def.defaultHeight,
    rotation: 0,
    color,
  }
  return { ...base, kind, text: '' }
}

export function isEditable(item: CanvasItem): item is Extract<CanvasItem, { text: string }> {
  return ITEM_KINDS[item.kind].editable
}

/** Build a freehand stroke item from page-space points: a bounding box + origin-local points. */
export function strokeFromPoints(points: CanvasPoint[], color: string): Extract<CanvasItem, { kind: 'stroke' }> {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    id: makeItemId(),
    kind: 'stroke',
    x: minX,
    y: minY,
    width: Math.max(1, Math.max(...xs) - minX),
    height: Math.max(1, Math.max(...ys) - minY),
    rotation: 0,
    color,
    points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
  }
}
