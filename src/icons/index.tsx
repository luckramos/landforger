import {
  AppWindow,
  ArrowUpRight,
  CaretUp,
  Circle,
  CornersIn,
  CornersOut,
  Cursor,
  Diamond,
  Eraser,
  Hexagon,
  House,
  IconBase,
  LineSegment,
  Lock,
  LockOpen,
  Minus,
  Note,
  PencilSimple,
  Pentagon,
  Plus,
  Record,
  Rectangle,
  Star,
  TextT,
  Triangle,
  X,
} from '@phosphor-icons/react'
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'
import type { ReactElement } from 'react'
import { forwardRef } from 'react'

/**
 * Semantic icon barrel.
 *
 * No screen may import `@phosphor-icons/react` directly — everything renders
 * through the semantic names exported here. This keeps icon choice (which
 * specific Phosphor glyph, weight, size) a single decision point, and lets
 * later issues add more semantic names without touching call sites.
 */

const DEFAULT_WEIGHT: NonNullable<IconProps['weight']> = 'light'
const DEFAULT_SIZE: NonNullable<IconProps['size']> = 20

/** Phosphor's effective stroke width per weight, in 256-unit viewBox coordinates. */
const WEIGHT_STROKES: Record<IconWeight, number> = {
  thin: 8,
  light: 12,
  regular: 16,
  bold: 24,
  fill: 16,
  duotone: 16,
}

/**
 * Builds a custom icon in Phosphor's coordinate system (256×256 viewBox) for
 * the few semantics its set lacks (dashed segment, ellipse, rounded square).
 * Behaves like any Phosphor icon: accepts IconProps, follows weight/size, and
 * inherits `currentColor`.
 */
function createStrokeIcon(displayName: string, draw: (strokeWidth: number) => ReactElement): Icon {
  const weights = new Map<IconWeight, ReactElement>(
    (Object.entries(WEIGHT_STROKES) as [IconWeight, number][]).map(([weight, strokeWidth]) => [
      weight,
      draw(strokeWidth),
    ]),
  )
  const CustomIcon = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <IconBase ref={ref} {...props} weights={weights} />
  ))
  CustomIcon.displayName = displayName
  return CustomIcon
}

/** Diagonal dashed segment mirroring Phosphor's LineSegment geometry. */
const LineSegmentDashed = createStrokeIcon('LineSegmentDashed', (strokeWidth) => (
  <line
    x1="40"
    y1="216"
    x2="216"
    y2="40"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeDasharray="57 39"
  />
))

/** Horizontal ellipse (Phosphor has no oval). */
const Ellipse = createStrokeIcon('Ellipse', (strokeWidth) => (
  <ellipse cx="128" cy="128" rx="96" ry="64" fill="none" stroke="currentColor" strokeWidth={strokeWidth} />
))

/** Square with clearly rounded corners (Phosphor's Square reads sharp at small sizes). */
const SquareRounded = createStrokeIcon('SquareRounded', (strokeWidth) => (
  <rect
    x="40"
    y="40"
    width="176"
    height="176"
    rx="48"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
  />
))

/** Wraps a Phosphor icon component with the app's default weight and size. Icons inherit `currentColor` unless `color` is passed. */
function withDefaults(PhosphorIcon: Icon) {
  function SemanticIcon(props: IconProps) {
    return <PhosphorIcon weight={DEFAULT_WEIGHT} size={DEFAULT_SIZE} {...props} />
  }
  SemanticIcon.displayName = `SemanticIcon(${PhosphorIcon.displayName ?? 'Icon'})`
  return SemanticIcon
}

/** Semantic icon names available to screens. Add new entries here as later issues need more glyphs. */
export const icons = {
  lock: withDefaults(Lock),
  unlock: withDefaults(LockOpen),
  // Reference Canvas tools (one per CanvasTool)
  toolSelect: withDefaults(Cursor),
  toolPencil: withDefaults(PencilSimple),
  toolArrow: withDefaults(ArrowUpRight),
  toolLine: withDefaults(LineSegment),
  toolDashed: withDefaults(LineSegmentDashed),
  toolShape: withDefaults(Diamond),
  toolText: withDefaults(TextT),
  toolSticky: withDefaults(Note),
  toolEraser: withDefaults(Eraser),
  toolLaser: withDefaults(Record),
  // Reference Canvas shapes (one per CanvasShape)
  shapeRectangle: withDefaults(Rectangle),
  shapeRounded: withDefaults(SquareRounded),
  shapeCircle: withDefaults(Circle),
  shapeEllipse: withDefaults(Ellipse),
  shapeDiamond: withDefaults(Diamond),
  shapeTriangle: withDefaults(Triangle),
  shapePentagon: withDefaults(Pentagon),
  shapeHexagon: withDefaults(Hexagon),
  shapeStar: withDefaults(Star),
  // Dockable window controls
  windowRestore: withDefaults(CaretUp),
  windowFloat: withDefaults(CornersIn),
  windowMaximize: withDefaults(CornersOut),
  windowMinimize: withDefaults(Minus),
  windowClose: withDefaults(X),
  panel: withDefaults(AppWindow),
  // Zoom controls
  zoomIn: withDefaults(Plus),
  zoomOut: withDefaults(Minus),
  resetView: withDefaults(House),
}

export type IconName = keyof typeof icons

export type { IconProps }
