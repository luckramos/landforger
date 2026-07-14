import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DockableWindow } from '../components/DockableWindow/DockableWindow'
import { prefersReducedMotion } from '../components/motionPrefs'
import type { World } from '../domain/types'
import { icons } from '../icons'
import type { WorldRepository } from '../repository/WorldRepository'
import {
  eraseItemsAlongSegment,
  marqueeSelection,
  normalizeRect,
  screenToCanvasPoint,
  smoothStrokePath,
  snapRectToGrid,
  zoomViewportAt,
} from './canvasDomain'
import { LaserTrailRenderer } from './LaserTrailRenderer'
import type {
  CanvasConnectorItem,
  CanvasItem,
  CanvasPoint,
  CanvasShape,
  CanvasTool,
  CanvasViewport,
} from './types'
import styles from './ReferenceCanvasPanel.module.css'

interface ReferenceCanvasPanelProps {
  world: World
  repository: WorldRepository
  onClose: () => void
}

type DrawTool = 'pencil' | 'arrow' | 'line' | 'dashed' | 'shape'

type PointerOperation =
  | { kind: 'draw'; tool: DrawTool; start: CanvasPoint; current: CanvasPoint; points: CanvasPoint[] }
  | { kind: 'marquee'; start: CanvasPoint; current: CanvasPoint }
  | { kind: 'pan'; start: CanvasPoint; viewport: CanvasViewport }
  | { kind: 'drag'; start: CanvasPoint; originals: Map<string, CanvasItem> }
  | { kind: 'resize'; start: CanvasPoint; item: CanvasItem }
  | { kind: 'erase'; previous: CanvasPoint }
  | { kind: 'laser' }

type SemanticIcon = (typeof icons)[keyof typeof icons]

interface ToolDefinition {
  tool: CanvasTool
  label: string
  icon: SemanticIcon
}

const TOOLS: ToolDefinition[] = [
  { tool: 'select', label: 'Select / pan', icon: icons.toolSelect },
  { tool: 'pencil', label: 'Pencil', icon: icons.toolPencil },
  { tool: 'arrow', label: 'Arrow', icon: icons.toolArrow },
  { tool: 'line', label: 'Line', icon: icons.toolLine },
  { tool: 'dashed', label: 'Dashed line', icon: icons.toolDashed },
  { tool: 'shape', label: 'Shape', icon: icons.toolShape },
  { tool: 'text', label: 'Text', icon: icons.toolText },
  { tool: 'sticky', label: 'Sticky note', icon: icons.toolSticky },
  { tool: 'eraser', label: 'Eraser', icon: icons.toolEraser },
  { tool: 'laser', label: 'Laser pointer', icon: icons.toolLaser },
]

interface ShapeDefinition {
  shape: CanvasShape
  label: string
  icon: SemanticIcon
  clipPath?: string
  rounded?: boolean
}

const SHAPE_META: Record<CanvasShape, ShapeDefinition> = {
  rectangle: { shape: 'rectangle', label: 'Rectangle shape', icon: icons.shapeRectangle },
  rounded: { shape: 'rounded', label: 'Rounded shape', icon: icons.shapeRounded, rounded: true },
  circle: { shape: 'circle', label: 'Circle shape', icon: icons.shapeCircle, clipPath: 'circle(50%)' },
  ellipse: { shape: 'ellipse', label: 'Ellipse shape', icon: icons.shapeEllipse, clipPath: 'ellipse(50% 42% at 50% 50%)' },
  diamond: { shape: 'diamond', label: 'Diamond shape', icon: icons.shapeDiamond, clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' },
  triangle: { shape: 'triangle', label: 'Triangle shape', icon: icons.shapeTriangle, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' },
  pentagon: { shape: 'pentagon', label: 'Pentagon shape', icon: icons.shapePentagon, clipPath: 'polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%)' },
  hexagon: { shape: 'hexagon', label: 'Hexagon shape', icon: icons.shapeHexagon, clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' },
  star: { shape: 'star', label: 'Star shape', icon: icons.shapeStar, clipPath: 'polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 94%, 50% 72%, 21% 94%, 32% 57%, 2% 35%, 39% 35%)' },
}
const SHAPES = Object.values(SHAPE_META)

const COLORS = [
  ['#e8d7b0', '#d8aa61', '#d99579', '#e06868'],
  ['#9bc4a5', '#7fb4a8', '#8ba7b8', '#7bdff2'],
  ['#c8bf72', '#b29bd4', '#d4a5c4', '#f4efe6'],
]

const INITIAL_VIEWPORT: CanvasViewport = { panX: 0, panY: 0, zoom: 1 }
const DEFAULT_TEXT_SIZE = { width: 192, height: 48 }
const DEFAULT_STICKY_SIZE = { width: 192, height: 136 }

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `canvas-${crypto.randomUUID()}`
    : `canvas-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function localPoint(event: { clientX: number; clientY: number }, stage: HTMLElement): CanvasPoint {
  const rect = stage.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function connectorGeometry(start: CanvasPoint, end: CanvasPoint) {
  const rect = normalizeRect(start, end)
  return {
    ...rect,
    start: { x: start.x - rect.x, y: start.y - rect.y },
    end: { x: end.x - rect.x, y: end.y - rect.y },
  }
}

function translateItem(item: CanvasItem, dx: number, dy: number): CanvasItem {
  return { ...item, x: item.x + dx, y: item.y + dy }
}

function resizeItem(item: CanvasItem, width: number, height: number): CanvasItem {
  const nextWidth = Math.max(8, width)
  const nextHeight = Math.max(8, height)
  if (item.kind === 'stroke') {
    const scaleX = item.width === 0 ? 1 : nextWidth / item.width
    const scaleY = item.height === 0 ? 1 : nextHeight / item.height
    return {
      ...item,
      width: nextWidth,
      height: nextHeight,
      points: item.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
    }
  }
  if (item.kind !== 'arrow' && item.kind !== 'line' && item.kind !== 'dashed') {
    return { ...item, width: nextWidth, height: nextHeight }
  }
  const scaleX = item.width === 0 ? 1 : nextWidth / item.width
  const scaleY = item.height === 0 ? 1 : nextHeight / item.height
  return {
    ...item,
    width: nextWidth,
    height: nextHeight,
    start: { x: item.start.x * scaleX, y: item.start.y * scaleY },
    end: { x: item.end.x * scaleX, y: item.end.y * scaleY },
  }
}

function snapItem(item: CanvasItem): CanvasItem {
  const snapped = snapRectToGrid(item)
  return resizeItem({ ...item, x: snapped.x, y: snapped.y }, snapped.width, snapped.height)
}

function itemStyle(item: CanvasItem): CSSProperties {
  return {
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    '--item-color': item.color,
  } as CSSProperties
}

export function ReferenceCanvasPanel({ world, repository, onClose }: ReferenceCanvasPanelProps) {
  const [items, setItems] = useState<CanvasItem[]>(() => structuredClone(world.canvas?.items ?? []))
  const [tool, setTool] = useState<CanvasTool>('select')
  const [shape, setShape] = useState<CanvasShape>('rectangle')
  const [color, setColor] = useState(COLORS[0][1])
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT)
  const [selected, setSelected] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string>()
  const [operation, setOperation] = useState<PointerOperation>()
  const [spacePressed, setSpacePressed] = useState(false)
  const itemsRef = useRef(items)
  const selectedRef = useRef(selected)
  const operationRef = useRef(operation)
  const viewportRef = useRef(viewport)
  const persistQueue = useRef<Promise<unknown>>(Promise.resolve())
  const stageRef = useRef<HTMLDivElement>(null)
  const laserPathRef = useRef<SVGPathElement>(null)
  const laserDotsRef = useRef<SVGGElement>(null)
  const laserRef = useRef<LaserTrailRenderer | undefined>(undefined)
  itemsRef.current = items
  selectedRef.current = selected
  operationRef.current = operation
  viewportRef.current = viewport

  useEffect(() => {
    if (!laserPathRef.current || !laserDotsRef.current) return
    const renderer = new LaserTrailRenderer(laserPathRef.current, laserDotsRef.current, {
      reducedMotion: prefersReducedMotion(),
    })
    laserRef.current = renderer
    return () => {
      renderer.destroy()
      laserRef.current = undefined
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isEditing = target instanceof Element && target.matches('input, textarea, [contenteditable="true"]')
      if (event.code === 'Space' && !isEditing) {
        event.preventDefault()
        setSpacePressed(true)
      }
      if (isEditing) return
      if (event.key === 'Escape') {
        setSelected([])
        setEditingId(undefined)
        setOperation(undefined)
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRef.current.length > 0) {
        event.preventDefault()
        const ids = new Set(selectedRef.current)
        commitItems(itemsRef.current.filter((item) => !ids.has(item.id)))
        setSelected([])
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const commitItems = (next: CanvasItem[]) => {
    itemsRef.current = next
    setItems(next)
    const snapshot = structuredClone(next)
    persistQueue.current = persistQueue.current
      .catch(() => undefined)
      .then(() => repository.updateWorld(world.slug, { canvas: { items: snapshot } }))
      .catch(() => undefined)
  }

  const canvasPoint = (event: ReactPointerEvent<HTMLElement>): CanvasPoint =>
    screenToCanvasPoint(localPoint(event, event.currentTarget), viewportRef.current)

  const beginStagePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    const screenPoint = localPoint(event, event.currentTarget)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = screenToCanvasPoint(screenPoint, viewportRef.current)
    if (event.button === 1 || spacePressed) {
      event.preventDefault()
      setOperation({ kind: 'pan', start: screenPoint, viewport: viewportRef.current })
      return
    }
    if (tool === 'select') {
      if (!event.shiftKey) setSelected([])
      setOperation({ kind: 'marquee', start: point, current: point })
    } else if (tool === 'pencil' || tool === 'arrow' || tool === 'line' || tool === 'dashed' || tool === 'shape') {
      setOperation({ kind: 'draw', tool, start: point, current: point, points: [point] })
    } else if (tool === 'text' || tool === 'sticky') {
      const size = tool === 'text' ? DEFAULT_TEXT_SIZE : DEFAULT_STICKY_SIZE
      const rect = snapRectToGrid({ x: point.x, y: point.y, ...size })
      const item: CanvasItem = tool === 'text'
        ? { id: makeId(), kind: 'text', ...rect, color, text: '' }
        : { id: makeId(), kind: 'sticky', ...rect, color, text: '' }
      commitItems([...itemsRef.current, item])
      setSelected([item.id])
      setEditingId(item.id)
    } else if (tool === 'eraser') {
      commitItems(eraseItemsAlongSegment(itemsRef.current, point, point))
      setOperation({ kind: 'erase', previous: point })
    } else if (tool === 'laser') {
      laserRef.current?.addPoint(point)
      setOperation({ kind: 'laser' })
    }
  }

  const moveStagePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = operationRef.current
    if (!active) return
    const screenPoint = localPoint(event, event.currentTarget)
    const point = screenToCanvasPoint(screenPoint, viewportRef.current)
    if (active.kind === 'pan') {
      setViewport({
        ...active.viewport,
        panX: active.viewport.panX + screenPoint.x - active.start.x,
        panY: active.viewport.panY + screenPoint.y - active.start.y,
      })
    } else if (active.kind === 'marquee') {
      setOperation({ ...active, current: point })
    } else if (active.kind === 'draw') {
      setOperation({ ...active, current: point, points: active.tool === 'pencil' ? [...active.points, point] : active.points })
    } else if (active.kind === 'drag') {
      const dx = point.x - active.start.x
      const dy = point.y - active.start.y
      const next = itemsRef.current.map((item) => {
        const original = active.originals.get(item.id)
        return original ? translateItem(original, dx, dy) : item
      })
      itemsRef.current = next
      setItems(next)
    } else if (active.kind === 'resize') {
      const next = itemsRef.current.map((item) => item.id === active.item.id
        ? resizeItem(active.item, active.item.width + point.x - active.start.x, active.item.height + point.y - active.start.y)
        : item)
      itemsRef.current = next
      setItems(next)
    } else if (active.kind === 'erase') {
      const next = eraseItemsAlongSegment(itemsRef.current, active.previous, point)
      commitItems(next)
      setOperation({ kind: 'erase', previous: point })
    } else if (active.kind === 'laser') {
      laserRef.current?.addPoint(point)
    }
  }

  const endStagePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = operationRef.current
    if (!active) return
    const point = canvasPoint(event)
    if (active.kind === 'marquee') {
      const matched = marqueeSelection(itemsRef.current, normalizeRect(active.start, point))
      setSelected(event.shiftKey ? [...new Set([...selectedRef.current, ...matched])] : matched)
    } else if (active.kind === 'draw') {
      const rawRect = normalizeRect(active.start, point)
      if (active.tool === 'pencil') {
        const absolutePoints = active.points.length > 1 ? [...active.points, point] : [active.start, point]
        const bounds = normalizeRect(
          { x: Math.min(...absolutePoints.map((candidate) => candidate.x)), y: Math.min(...absolutePoints.map((candidate) => candidate.y)) },
          { x: Math.max(...absolutePoints.map((candidate) => candidate.x)), y: Math.max(...absolutePoints.map((candidate) => candidate.y)) },
        )
        const snapped = snapRectToGrid(bounds)
        const item: CanvasItem = {
          id: makeId(), kind: 'stroke', ...snapped, color,
          points: absolutePoints.map((candidate) => ({ x: candidate.x - snapped.x, y: candidate.y - snapped.y })),
        }
        commitItems([...itemsRef.current, item])
        setSelected([item.id])
      } else if (active.tool === 'shape') {
        const item: CanvasItem = { id: makeId(), kind: 'shape', ...snapRectToGrid(rawRect), color, shape }
        commitItems([...itemsRef.current, item])
        setSelected([item.id])
      } else {
        const geometry = connectorGeometry(active.start, point)
        const snappedRect = snapRectToGrid(geometry)
        const scaleX = geometry.width === 0 ? 1 : snappedRect.width / geometry.width
        const scaleY = geometry.height === 0 ? 1 : snappedRect.height / geometry.height
        const item: CanvasConnectorItem = {
          id: makeId(), kind: active.tool, ...snappedRect, color,
          start: { x: geometry.start.x * scaleX, y: geometry.start.y * scaleY },
          end: { x: geometry.end.x * scaleX, y: geometry.end.y * scaleY },
        }
        commitItems([...itemsRef.current, item])
        setSelected([item.id])
      }
    } else if (active.kind === 'drag' || active.kind === 'resize') {
      const changedIds = active.kind === 'drag' ? new Set(active.originals.keys()) : new Set([active.item.id])
      commitItems(itemsRef.current.map((item) => changedIds.has(item.id) ? snapItem(item) : item))
    } else if (active.kind === 'laser') {
      laserRef.current?.finish()
    }
    setOperation(undefined)
  }

  const beginItemDrag = (item: CanvasItem, event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'select' || event.button !== 0) return
    event.stopPropagation()
    const stage = event.currentTarget.closest('[data-testid="reference-canvas-stage"]') as HTMLElement
    stage.setPointerCapture?.(event.pointerId)
    const point = screenToCanvasPoint(localPoint(event, stage), viewportRef.current)
    const ids = event.shiftKey
      ? selectedRef.current.includes(item.id) ? selectedRef.current : [...selectedRef.current, item.id]
      : selectedRef.current.includes(item.id) ? selectedRef.current : [item.id]
    setSelected(ids)
    setOperation({
      kind: 'drag',
      start: point,
      originals: new Map(itemsRef.current.filter((candidate) => ids.includes(candidate.id)).map((candidate) => [candidate.id, candidate])),
    })
  }

  const beginResize = (item: CanvasItem, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const stage = event.currentTarget.closest('[data-testid="reference-canvas-stage"]') as HTMLElement
    stage.setPointerCapture?.(event.pointerId)
    const point = screenToCanvasPoint(localPoint(event, stage), viewportRef.current)
    setOperation({ kind: 'resize', start: point, item })
  }

  const updateText = (item: Extract<CanvasItem, { kind: 'text' | 'sticky' }>, text: string) => {
    const next = itemsRef.current.map((candidate) => candidate.id === item.id ? { ...candidate, text } : candidate)
    itemsRef.current = next
    setItems(next)
  }

  const finishEditing = (item: Extract<CanvasItem, { kind: 'text' | 'sticky' }>) => {
    const current = itemsRef.current.find((candidate) => candidate.id === item.id)
    const next = current && 'text' in current && current.text.trim() === ''
      ? itemsRef.current.filter((candidate) => candidate.id !== item.id)
      : itemsRef.current
    const removed = next.length !== itemsRef.current.length
    commitItems(next)
    setEditingId(undefined)
    if (removed) setSelected([])
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const anchor = localPoint(event, event.currentTarget)
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    setViewport((current) => zoomViewportAt(current, anchor, current.zoom * factor))
  }

  const zoomFromCenter = (factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const anchor = { x: rect.width / 2, y: rect.height / 2 }
    setViewport((current) => zoomViewportAt(current, anchor, current.zoom * factor))
  }

  const marquee = operation?.kind === 'marquee' ? normalizeRect(operation.start, operation.current) : undefined
  const preview = useMemo(() => {
    if (operation?.kind !== 'draw') return undefined
    if (operation.tool === 'pencil') return smoothStrokePath(operation.points)
    return operation
  }, [operation])

  const selectTool = (next: CanvasTool) => {
    if (tool === 'laser') laserRef.current?.clear()
    setTool(next)
    setOperation(undefined)
  }

  return (
    <DockableWindow
      title="Reference canvas"
      subtitle={`${items.length} items · ${Math.round(viewport.zoom * 100)}%`}
      accent="var(--bronze)"
      onClose={onClose}
    >
      <div className={styles.canvas}>
        <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
          <div className={styles.tools}>
            {TOOLS.map((definition) => (
              <button
                key={definition.tool}
                type="button"
                aria-label={definition.label}
                aria-pressed={tool === definition.tool}
                title={definition.label}
                onClick={() => selectTool(definition.tool)}
              >
                <definition.icon size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
          {tool === 'shape' && (
            <div className={styles.shapePicker} role="listbox" aria-label="Canvas shapes">
              {SHAPES.map((entry) => (
                <button
                  key={entry.shape}
                  type="button"
                  role="option"
                  aria-label={entry.label}
                  aria-selected={shape === entry.shape}
                  title={entry.label}
                  onClick={() => setShape(entry.shape)}
                >
                  <entry.icon size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <div className={styles.palette} aria-label="Canvas color palette">
            {COLORS.map((row, index) => (
              <div key={index} role="group" aria-label={`Canvas colors row ${index + 1}`}>
                {row.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    aria-label={`Use color ${entry}`}
                    aria-pressed={color === entry}
                    style={{ background: entry }}
                    onClick={() => setColor(entry)}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className={styles.zoomControls} aria-label="Canvas zoom controls">
            <button type="button" aria-label="Zoom out" onClick={() => zoomFromCenter(1 / 1.15)}><icons.zoomOut size={10} aria-hidden="true" /></button>
            <button type="button" aria-label="Reset zoom" onClick={() => setViewport(INITIAL_VIEWPORT)}>{Math.round(viewport.zoom * 100)}%</button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomFromCenter(1.15)}><icons.zoomIn size={10} aria-hidden="true" /></button>
          </div>
          <p>Drag blank space to select · hold Space to pan</p>
        </div>

        <div
          ref={stageRef}
          className={styles.stage}
          data-testid="reference-canvas-stage"
          data-zoom={viewport.zoom}
          data-pan={`${viewport.panX},${viewport.panY}`}
          data-tool={tool}
          data-live-item={operation?.kind === 'drag' || operation?.kind === 'resize' ? 'true' : undefined}
          style={{
            '--grid-size': `${22 * viewport.zoom}px`,
            '--grid-x': `${viewport.panX}px`,
            '--grid-y': `${viewport.panY}px`,
          } as CSSProperties}
          onPointerDown={beginStagePointer}
          onPointerMove={moveStagePointer}
          onPointerUp={endStagePointer}
          onPointerCancel={() => setOperation(undefined)}
          onWheel={onWheel}
        >
          <div
            className={styles.world}
            style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}
          >
            {items.map((item) => {
              const isSelected = selected.includes(item.id)
              return (
                <div
                  key={item.id}
                  className={`${styles.item} ${styles[item.kind]}`}
                  style={itemStyle(item)}
                  data-testid={`canvas-item-${item.id}`}
                  data-kind={item.kind}
                  data-shape={item.kind === 'shape' ? item.shape : undefined}
                  data-selected={isSelected || undefined}
                  data-x={item.x}
                  data-width={item.width}
                  onPointerDown={(event) => beginItemDrag(item, event)}
                  onDoubleClick={() => {
                    if (item.kind === 'text' || item.kind === 'sticky') setEditingId(item.id)
                  }}
                >
                  {item.kind === 'stroke' && (
                    <svg viewBox={`0 0 ${Math.max(1, item.width)} ${Math.max(1, item.height)}`} preserveAspectRatio="none">
                      <path d={smoothStrokePath(item.points)} />
                    </svg>
                  )}
                  {(item.kind === 'arrow' || item.kind === 'line' || item.kind === 'dashed') && (
                    <svg viewBox={`0 0 ${Math.max(1, item.width)} ${Math.max(1, item.height)}`} preserveAspectRatio="none">
                      <defs><marker id={`arrow-${item.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 Z" /></marker></defs>
                      <line
                        x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y}
                        strokeDasharray={item.kind === 'dashed' ? '8 6' : undefined}
                        markerEnd={item.kind === 'arrow' ? `url(#arrow-${item.id})` : undefined}
                      />
                    </svg>
                  )}
                  {item.kind === 'shape' && (
                    <span
                      className={SHAPE_META[item.shape].rounded ? styles.roundedShape : undefined}
                      style={{ clipPath: SHAPE_META[item.shape].clipPath }}
                    />
                  )}
                  {(item.kind === 'text' || item.kind === 'sticky') && editingId === item.id ? (
                    <textarea
                      autoFocus
                      aria-label={item.kind === 'sticky' ? 'Edit sticky note' : 'Edit canvas text'}
                      value={item.text}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => updateText(item, event.target.value)}
                      onBlur={() => finishEditing(item)}
                    />
                  ) : item.kind === 'text' || item.kind === 'sticky' ? <span>{item.text || 'Double-click to edit'}</span> : null}
                  {item.kind === 'image' && <img src={item.src} alt={item.alt} draggable={false} />}
                  {item.kind === 'link' && <a href={`/w/${world.slug}/p/${item.pageSlug}`} onPointerDown={(event) => event.preventDefault()}>↗ {item.label}</a>}
                  {isSelected && tool === 'select' && (
                    <button
                      type="button"
                      className={styles.itemResize}
                      aria-label={`Resize ${item.kind} item`}
                      onPointerDown={(event) => beginResize(item, event)}
                    />
                  )}
                </div>
              )
            })}

            {marquee && <div className={styles.marquee} style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}

            {operation?.kind === 'draw' && operation.tool === 'shape' && (
              <div className={styles.shapePreview} style={{ ...normalizeRect(operation.start, operation.current), borderColor: color }} />
            )}
            {preview && operation?.kind === 'draw' && operation.tool !== 'shape' && (
              <svg className={styles.previewSvg}>
                {operation.tool === 'pencil'
                  ? <path d={preview as string} stroke={color} />
                  : <line x1={operation.start.x} y1={operation.start.y} x2={operation.current.x} y2={operation.current.y} stroke={color} strokeDasharray={operation.tool === 'dashed' ? '8 6' : undefined} />}
              </svg>
            )}

            <svg className={styles.laser} aria-hidden="true">
              <path ref={laserPathRef} data-testid="canvas-laser-path" />
              <g ref={laserDotsRef} />
            </svg>
          </div>
        </div>
      </div>
    </DockableWindow>
  )
}
