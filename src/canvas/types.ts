export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasRect extends CanvasPoint {
  width: number
  height: number
}

export interface CanvasViewport {
  panX: number
  panY: number
  zoom: number
}

/**
 * A reference mood board is a collage, not a diagram — so the item set is
 * annotations and reference nodes, never geometric shapes. Annotation kinds are
 * `text`, `sticky`, and freeform `stroke`; the four reference nodes
 * (image/pdf/md/link) arrive in later slices.
 */
export type CanvasItemKind = 'text' | 'sticky' | 'stroke'

interface CanvasItemBase extends CanvasRect {
  id: string
  /** Clockwise rotation in degrees about the item's centre. */
  rotation: number
  color: string
}

export interface CanvasTextItem extends CanvasItemBase {
  kind: 'text'
  text: string
}

export interface CanvasStickyItem extends CanvasItemBase {
  kind: 'sticky'
  text: string
}

export interface CanvasStrokeItem extends CanvasItemBase {
  kind: 'stroke'
  /** Freeform points, local to the item's x/y origin. */
  points: CanvasPoint[]
}

export type CanvasItem = CanvasTextItem | CanvasStickyItem | CanvasStrokeItem

/**
 * A link is its own record referencing two item ids — never a field on an item —
 * so many links may share an endpoint (N-to-N) and geometry is always derived
 * from the endpoints. Canvas-local only; it never touches the world backlink
 * index or Graph view. Populated by the connector slice; empty here.
 */
export interface CanvasLink {
  id: string
  fromId: string
  toId: string
}

export interface ReferenceCanvas {
  items: CanvasItem[]
  links: CanvasLink[]
}

export type CanvasTool = 'select' | 'hand' | 'text' | 'sticky' | 'pencil' | 'eraser' | 'laser'
