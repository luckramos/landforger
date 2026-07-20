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
 * `text`, `sticky`, and freeform `stroke`; `image` is the first reference node
 * (pdf/md/link arrive in later slices).
 */
export type CanvasItemKind = 'text' | 'sticky' | 'stroke' | 'image'

/**
 * How a file-backed reference node points at its content. Only this reference —
 * never the bytes — is written to `_world.md`: an uploaded file lives in the
 * AssetStore (keyed by `assetId`), while a pasted link is a plain URL.
 */
export type NodeSource =
  | { type: 'asset'; assetId: string; filename: string; mime: string; size: number }
  | { type: 'url'; href: string }

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

export interface CanvasImageItem extends CanvasItemBase {
  kind: 'image'
  /** Where the bitmap comes from — an uploaded asset or a pasted URL. */
  source: NodeSource
  /** Optional caption shown beneath the image. */
  caption: string
}

export type CanvasItem = CanvasTextItem | CanvasStickyItem | CanvasStrokeItem | CanvasImageItem

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
