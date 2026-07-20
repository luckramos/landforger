import {
  AppWindow,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowLineDown,
  ArrowLineUp,
  ArrowRight,
  ArrowsOutLineHorizontal,
  ArrowUpRight,
  At,
  BookOpen,
  CalendarBlank,
  CalendarStar,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CastleTurret,
  Check,
  Circle,
  Clock,
  Compass,
  CornersIn,
  CornersOut,
  Cursor,
  Diamond,
  DotsSixVertical,
  DotsThree,
  DotsThreeVertical,
  Eraser,
  FilePdf,
  Gear,
  GlobeHemisphereWest,
  Hash,
  Hexagon,
  Highlighter,
  Hourglass,
  House,
  IconBase,
  Image,
  LineSegment,
  LinkBreak,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  Lock,
  LockOpen,
  MagnifyingGlass,
  MapPin,
  MarkdownLogo,
  Minus,
  Note,
  Paragraph,
  Path,
  PencilSimple,
  Pentagon,
  Plus,
  Quotes,
  Record,
  Rectangle,
  Rows,
  ShareNetwork,
  SquaresFour,
  Star,
  Sword,
  Table,
  Target,
  Trash,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextT,
  TextUnderline,
  Triangle,
  UploadSimple,
  User,
  X,
} from '@phosphor-icons/react'
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'
import type { ComponentType, ReactElement } from 'react'
import { forwardRef } from 'react'
import type { Category } from '../domain/types'
import styles from './index.module.css'

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

/**
 * Wraps a Phosphor icon for Category use: Duotone weight, with the
 * background wash bound to whatever `--icon-secondary-color` the call site
 * sets (typically `var(--cat-<category>)`) via `index.module.css`. The
 * outline path is left on `currentColor` so it stays legible against any
 * background — only the wash carries the Category color.
 */
function withCategoryDefaults(PhosphorIcon: Icon) {
  function SemanticCategoryIcon({ className, ...rest }: IconProps) {
    const mergedClassName = className ? `${styles.categoryIcon} ${className}` : styles.categoryIcon
    return <PhosphorIcon weight="duotone" size={DEFAULT_SIZE} {...rest} className={mergedClassName} />
  }
  SemanticCategoryIcon.displayName = `SemanticCategoryIcon(${PhosphorIcon.displayName ?? 'Icon'})`
  return SemanticCategoryIcon
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
  // Dashboard shell chrome
  caretLeft: withDefaults(CaretLeft),
  caretRight: withDefaults(CaretRight),
  caretDown: withDefaults(CaretDown),
  add: withDefaults(Plus),
  home: withDefaults(House),
  worlds: withDefaults(GlobeHemisphereWest),
  map: withDefaults(Compass),
  timeline: withDefaults(Clock),
  graph: withDefaults(ShareNetwork),
  canvas: withDefaults(SquaresFour),
  search: withDefaults(MagnifyingGlass),
  focus: withDefaults(Target),
  documentWidth: withDefaults(ArrowsOutLineHorizontal),
  close: withDefaults(X),
  check: withDefaults(Check),
  settings: withDefaults(Gear),
  edit: withDefaults(PencilSimple),
  minus: withDefaults(Minus),
  marker: withDefaults(Diamond),
  circle: withDefaults(Circle),
  grip: withDefaults(DotsSixVertical),
  moreHorizontal: withDefaults(DotsThree),
  arrowRight: withDefaults(ArrowRight),
  upload: withDefaults(UploadSimple),
  calendar: withDefaults(CalendarBlank),
  link: withDefaults(LinkSimple),
  // Reference-canvas node + connector tools (distinct glyphs per kind)
  filePdf: withDefaults(FilePdf),
  fileMarkdown: withDefaults(MarkdownLogo),
  linkConnector: withDefaults(Path),
  unlink: withDefaults(LinkBreak),
  // Custom Property types (one per CustomPropertyType, for the add-property menu)
  typeText: withDefaults(TextT),
  typeTextarea: withDefaults(Paragraph),
  typeNumber: withDefaults(Hash),
  typeDate: withDefaults(CalendarBlank),
  typeSelect: withDefaults(ListBullets),
  typeRelation: withDefaults(LinkSimple),
  typeImage: withDefaults(Image),
  // Rich-text toolbar
  editorUndo: withDefaults(ArrowCounterClockwise),
  editorRedo: withDefaults(ArrowClockwise),
  editorText: withDefaults(Paragraph),
  editorH1: withDefaults(TextHOne),
  editorH2: withDefaults(TextHTwo),
  editorH3: withDefaults(TextHThree),
  editorBold: withDefaults(TextB),
  editorItalic: withDefaults(TextItalic),
  editorUnderline: withDefaults(TextUnderline),
  editorStrike: withDefaults(TextStrikethrough),
  editorHighlight: withDefaults(Highlighter),
  editorLink: withDefaults(LinkSimple),
  editorWikilink: withDefaults(At),
  editorBulletList: withDefaults(ListBullets),
  editorNumberedList: withDefaults(ListNumbers),
  editorTaskList: withDefaults(ListChecks),
  editorQuote: withDefaults(Quotes),
  editorCallout: withDefaults(Note),
  editorToggle: withDefaults(CaretRight),
  editorDivider: withDefaults(Minus),
  editorTable: withDefaults(Table),
  trash: withDefaults(Trash),
  kebab: withDefaults(DotsThreeVertical),
  headerRow: withDefaults(Rows),
  anchorTop: withDefaults(ArrowLineUp),
  anchorBottom: withDefaults(ArrowLineDown),
}

/**
 * Category icons: Phosphor Duotone, one per Page Category. `categoryMeta.ts`
 * pairs these with labels/colors; every consumer renders through that
 * module rather than importing this map directly.
 */
export const categoryIcons: Record<Category, ComponentType<IconProps>> = {
  stories: withCategoryDefaults(BookOpen),
  eras: withCategoryDefaults(Hourglass),
  characters: withCategoryDefaults(User),
  locations: withCategoryDefaults(MapPin),
  items: withCategoryDefaults(Sword),
  organizations: withCategoryDefaults(CastleTurret),
  events: withCategoryDefaults(CalendarStar),
}

export type IconName = keyof typeof icons

export type { IconProps }
