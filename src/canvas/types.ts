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

export type CanvasShape = 'rectangle' | 'rounded' | 'circle' | 'ellipse' | 'diamond' | 'triangle' | 'pentagon' | 'hexagon' | 'star'

interface CanvasItemBase extends CanvasRect {
  id: string
  color: string
}

export interface CanvasStrokeItem extends CanvasItemBase {
  kind: 'stroke'
  /** Points local to the item's x/y origin. */
  points: CanvasPoint[]
}

export interface CanvasConnectorItem extends CanvasItemBase {
  kind: 'arrow' | 'line' | 'dashed'
  start: CanvasPoint
  end: CanvasPoint
}

export interface CanvasShapeItem extends CanvasItemBase {
  kind: 'shape'
  shape: CanvasShape
}

export interface CanvasTextItem extends CanvasItemBase {
  kind: 'text'
  text: string
}

export interface CanvasStickyItem extends CanvasItemBase {
  kind: 'sticky'
  text: string
}

export interface CanvasImageItem extends CanvasItemBase {
  kind: 'image'
  src: string
  alt: string
}

export interface CanvasLinkItem extends CanvasItemBase {
  kind: 'link'
  pageSlug: string
  label: string
}

export type CanvasItem =
  | CanvasStrokeItem
  | CanvasConnectorItem
  | CanvasShapeItem
  | CanvasTextItem
  | CanvasStickyItem
  | CanvasImageItem
  | CanvasLinkItem

export interface ReferenceCanvas {
  items: CanvasItem[]
}

export type CanvasTool = 'select' | 'pencil' | 'arrow' | 'line' | 'dashed' | 'shape' | 'text' | 'sticky' | 'eraser' | 'laser'
