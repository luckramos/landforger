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
}

let counter = 0

export function makeItemId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `canvas-${crypto.randomUUID()}`
  counter += 1
  return `canvas-item-${counter}`
}

/** Create an item of `kind` centred on `at`, using registry defaults. */
export function createItem(kind: CanvasItemKind, at: CanvasPoint, color: string): CanvasItem {
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
