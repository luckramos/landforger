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
 * `text`, `sticky`, and freeform `stroke`; the reference nodes are `image`,
 * `link`, `pdf`, and `md`.
 */
export type CanvasItemKind = 'text' | 'sticky' | 'stroke' | 'image' | 'link' | 'pdf' | 'md'

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

/** A web-link card. Source is always a URL; `title` is the user-editable display name. */
export interface CanvasLinkItem extends CanvasItemBase {
  kind: 'link'
  source: Extract<NodeSource, { type: 'url' }>
  title: string
}

/** A PDF reference card (representative — no in-app rendering). */
export interface CanvasPdfItem extends CanvasItemBase {
  kind: 'pdf'
  source: NodeSource
  title: string
}

/** A Markdown reference card; its `.md` file is always an uploaded asset (its text is rendered read-only). */
export interface CanvasMdItem extends CanvasItemBase {
  kind: 'md'
  source: Extract<NodeSource, { type: 'asset' }>
  title: string
}

export type CanvasItem =
  | CanvasTextItem
  | CanvasStickyItem
  | CanvasStrokeItem
  | CanvasImageItem
  | CanvasLinkItem
  | CanvasPdfItem
  | CanvasMdItem

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
