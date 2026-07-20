import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DockableWindow } from '../components/DockableWindow/DockableWindow'
import type { World } from '../domain/types'
import { icons } from '../icons'
import type { WorldRepository } from '../repository/WorldRepository'
import {
  itemCenter,
  marqueeContains,
  pointInItem,
  rectFromPoints,
  resizeItem,
  rotationForPointer,
  screenToPage,
  zoomAt,
  type ResizeHandle,
} from './engine/geometry'
import { createItem, ITEM_KINDS, isEditable } from './engine/itemKinds'
import { CanvasStore } from './engine/store'
import type { CanvasItem, CanvasItemKind, CanvasPoint, CanvasRect, CanvasTool, CanvasViewport, ReferenceCanvas } from './types'
import styles from './ReferenceCanvasPanel.module.css'

interface ReferenceCanvasPanelProps {
  world: World
  repository: WorldRepository
  onClose: () => void
}

const DEFAULT_COLOR: Record<CanvasItemKind, string> = { text: '#f4efe6', sticky: '#d8aa61' }

type ToolIcon = (typeof icons)[keyof typeof icons]
interface ToolButton {
  label: string
  icon: ToolIcon
  tool?: CanvasTool // omitted → a placeholder for a later slice (rendered disabled)
  title?: string
}
interface ToolGroup {
  name: string
  tools: ToolButton[]
}

/**
 * The bottom toolbar's workflow groups. Data-driven so a later slice adds a tool
 * by adding a row, not another hand-written <button>. Tools without a `tool` are
 * disabled placeholders that show the whole workflow before their slice lands.
 */
const TOOL_GROUPS: ToolGroup[] = [
  { name: 'Navigate', tools: [
    { label: 'Select', icon: icons.toolSelect, tool: 'select' },
    { label: 'Hand', icon: icons.grip, tool: 'hand', title: 'Pan (Space)' },
  ] },
  { name: 'Annotate', tools: [
    { label: 'Text', icon: icons.toolText, tool: 'text' },
    { label: 'Sticky note', icon: icons.toolSticky, tool: 'sticky' },
    { label: 'Pencil', icon: icons.toolPencil },
    { label: 'Eraser', icon: icons.toolEraser },
    { label: 'Laser', icon: icons.toolLaser },
  ] },
  { name: 'Reference nodes', tools: [
    { label: 'Image', icon: icons.typeImage },
    { label: 'PDF', icon: icons.documentWidth },
    { label: 'Markdown', icon: icons.editorText },
    { label: 'Link node', icon: icons.link },
  ] },
  { name: 'Connect', tools: [
    { label: 'Link string', icon: icons.editorLink },
  ] },
]
const RESIZE_HANDLES: { handle: ResizeHandle; left: string; top: string }[] = [
  { handle: 'nw', left: '0%', top: '0%' },
  { handle: 'n', left: '50%', top: '0%' },
  { handle: 'ne', left: '100%', top: '0%' },
  { handle: 'e', left: '100%', top: '50%' },
  { handle: 'se', left: '100%', top: '100%' },
  { handle: 's', left: '50%', top: '100%' },
  { handle: 'sw', left: '0%', top: '100%' },
  { handle: 'w', left: '0%', top: '50%' },
]

type Operation =
  | { kind: 'pan'; startScreen: CanvasPoint; startPan: CanvasPoint }
  | { kind: 'marquee'; start: CanvasPoint }
  | { kind: 'drag'; startPage: CanvasPoint; originals: Map<string, CanvasItem> }
  | { kind: 'resize'; handle: ResizeHandle; original: CanvasItem }
  | { kind: 'rotate'; original: CanvasItem; center: CanvasPoint }

function initialCanvas(world: World): ReferenceCanvas {
  return {
    items: structuredClone(world.canvas?.items ?? []),
    links: structuredClone(world.canvas?.links ?? []),
  }
}

function localPoint(event: { clientX: number; clientY: number }, stage: HTMLElement): CanvasPoint {
  const rect = stage.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

export function ReferenceCanvasPanel({ world, repository, onClose }: ReferenceCanvasPanelProps) {
  const persistQueue = useRef<Promise<unknown>>(Promise.resolve())
  const storeRef = useRef<CanvasStore>(undefined)
  if (!storeRef.current) {
    storeRef.current = new CanvasStore(initialCanvas(world), (snapshot) => {
      const canvas = structuredClone(snapshot)
      persistQueue.current = persistQueue.current
        .catch(() => undefined)
        .then(() => repository.updateWorld(world.slug, { canvas }))
        .catch(() => undefined)
    })
  }
  const store = storeRef.current
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)

  const [tool, setTool] = useState<CanvasTool>('select')
  const [viewport, setViewport] = useState<CanvasViewport>({ panX: 0, panY: 0, zoom: 1 })
  const [selected, setSelected] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string>()
  const [spacePressed, setSpacePressed] = useState(false)
  const [live, setLive] = useState(false)
  const [marqueeRect, setMarqueeRect] = useState<CanvasRect>()

  const stageRef = useRef<HTMLDivElement>(null)
  const operationRef = useRef<Operation>(undefined)
  const viewportRef = useRef(viewport)
  const selectedRef = useRef(selected)
  viewportRef.current = viewport
  selectedRef.current = selected

  // --- Keyboard: pan, delete, undo/redo, escape ---
  useEffect(() => {
    const isEditingTarget = (target: EventTarget | null) =>
      target instanceof Element && target.matches('input, textarea, [contenteditable="true"]')

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditingTarget(event.target)) {
        event.preventDefault()
        setSpacePressed(true)
        return
      }
      if (isEditingTarget(event.target)) return
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
        setSelected((current) => current.filter((id) => store.getSnapshot().items.some((item) => item.id === id)))
        return
      }
      if (event.key === 'Escape') {
        setSelected([])
        setEditingId(undefined)
        operationRef.current = undefined
        setMarqueeRect(undefined)
        setLive(false)
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRef.current.length > 0) {
        event.preventDefault()
        store.removeItems(selectedRef.current)
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
  }, [store])

  // --- Stage pointer gestures ---
  const beginStagePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    const stage = event.currentTarget
    stage.setPointerCapture?.(event.pointerId)
    const screen = localPoint(event, stage)
    const page = screenToPage(screen, viewportRef.current)

    if (event.button === 1 || spacePressed || tool === 'hand') {
      event.preventDefault()
      operationRef.current = { kind: 'pan', startScreen: screen, startPan: { x: viewportRef.current.panX, y: viewportRef.current.panY } }
      return
    }
    if (tool === 'select') {
      // Geometry-accurate hit test: topmost item whose (rotated) body covers the
      // point. A click on transparent space between items falls through to marquee.
      const hitItem = [...store.getSnapshot().items].reverse().find((item) => pointInItem(item, page))
      if (hitItem) {
        startDrag(hitItem, page, event.shiftKey)
        return
      }
      if (!event.shiftKey) setSelected([])
      setEditingId(undefined)
      operationRef.current = { kind: 'marquee', start: page }
      setMarqueeRect({ x: page.x, y: page.y, width: 0, height: 0 })
      return
    }
    // text / sticky: create an item and edit it immediately
    const kind = tool as CanvasItemKind
    const item = createItem(kind, page, DEFAULT_COLOR[kind])
    store.addItem(item)
    setSelected([item.id])
    setEditingId(item.id)
    setTool('select')
  }

  const moveStagePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const op = operationRef.current
    if (!op) return
    const stage = event.currentTarget
    const screen = localPoint(event, stage)
    const page = screenToPage(screen, viewportRef.current)

    if (op.kind === 'pan') {
      setViewport((current) => ({ ...current, panX: op.startPan.x + screen.x - op.startScreen.x, panY: op.startPan.y + screen.y - op.startScreen.y }))
    } else if (op.kind === 'marquee') {
      setMarqueeRect(rectFromPoints(op.start, page))
    } else if (op.kind === 'drag') {
      const dx = page.x - op.startPage.x
      const dy = page.y - op.startPage.y
      for (const [id, original] of op.originals) store.setItem(id, { ...original, x: original.x + dx, y: original.y + dy })
    } else if (op.kind === 'resize') {
      store.setItem(op.original.id, resizeItem(op.original, op.handle, page, { aspect: event.shiftKey }))
    } else if (op.kind === 'rotate') {
      const angle = Math.round(rotationForPointer(op.center, page))
      store.setItem(op.original.id, { ...op.original, rotation: angle })
    }
  }

  const endStagePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const op = operationRef.current
    operationRef.current = undefined
    if (!op) return
    if (op.kind === 'marquee') {
      const page = screenToPage(localPoint(event, event.currentTarget), viewportRef.current)
      const box = rectFromPoints(op.start, page)
      const hit = marqueeContains(store.getSnapshot().items, box)
      setSelected((current) => (event.shiftKey ? [...new Set([...current, ...hit])] : hit))
      setMarqueeRect(undefined)
    } else if (op.kind === 'drag') {
      // Only record an undo step if the drag actually moved something — a bare
      // click to select shouldn't create a no-op history entry.
      const moved = [...op.originals].some(([id, original]) => {
        const current = store.getSnapshot().items.find((item) => item.id === id)
        return current ? current.x !== original.x || current.y !== original.y : false
      })
      if (moved) store.commit()
    } else if (op.kind === 'resize' || op.kind === 'rotate') {
      store.commit()
    }
    setLive(false)
  }

  const startDrag = (item: CanvasItem, page: CanvasPoint, additive: boolean) => {
    const nextSelected = additive
      ? selectedRef.current.includes(item.id) ? selectedRef.current : [...selectedRef.current, item.id]
      : selectedRef.current.includes(item.id) ? selectedRef.current : [item.id]
    setSelected(nextSelected)
    const originals = new Map(store.getSnapshot().items.filter((candidate) => nextSelected.includes(candidate.id)).map((candidate) => [candidate.id, candidate]))
    operationRef.current = { kind: 'drag', startPage: page, originals }
    setLive(true)
  }

  const beginResize = (item: CanvasItem, handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    stageRef.current?.setPointerCapture?.(event.pointerId)
    operationRef.current = { kind: 'resize', handle, original: item }
    setLive(true)
  }

  const beginRotate = (item: CanvasItem, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    stageRef.current?.setPointerCapture?.(event.pointerId)
    operationRef.current = { kind: 'rotate', original: item, center: itemCenter(item) }
    setLive(true)
  }

  const updateText = (item: CanvasItem, text: string) => {
    if (!isEditable(item)) return
    store.setItem(item.id, { ...item, text })
  }

  const finishEditing = (item: CanvasItem) => {
    const current = store.getSnapshot().items.find((candidate) => candidate.id === item.id)
    if (current && isEditable(current) && current.text.trim() === '') {
      store.removeItems([current.id])
      setSelected((selection) => selection.filter((id) => id !== current.id))
    } else {
      store.commit()
    }
    setEditingId(undefined)
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const anchor = localPoint(event, event.currentTarget)
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    setViewport((current) => zoomAt(current, anchor, current.zoom * factor))
  }

  const zoomFromCenter = (factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    setViewport((current) => zoomAt(current, { x: rect.width / 2, y: rect.height / 2 }, current.zoom * factor))
  }

  const selectTool = (next: CanvasTool) => {
    setTool(next)
    operationRef.current = undefined
  }

  const soleSelected = selected.length === 1 ? snapshot.items.find((item) => item.id === selected[0]) : undefined
  const gridSize = 22 * viewport.zoom

  return (
    <DockableWindow
      panelId="canvas"
      title="Reference canvas"
      subtitle={`${snapshot.items.length} items · ${Math.round(viewport.zoom * 100)}%`}
      accent="var(--bronze)"
      onClose={onClose}
    >
      <div className={styles.canvas}>
        <div
          ref={stageRef}
          className={styles.stage}
          data-testid="reference-canvas-stage"
          data-tool={tool}
          data-zoom={viewport.zoom}
          data-pan={`${viewport.panX},${viewport.panY}`}
          data-live-item={live ? 'true' : undefined}
          data-panning={operationRef.current?.kind === 'pan' ? 'true' : undefined}
          style={{ '--grid': gridSize, '--grid-x': viewport.panX, '--grid-y': viewport.panY } as CSSProperties}
          onPointerDown={beginStagePointer}
          onPointerMove={moveStagePointer}
          onPointerUp={endStagePointer}
          onPointerCancel={() => { operationRef.current = undefined; setMarqueeRect(undefined); setLive(false) }}
          onWheel={onWheel}
        >
          <div className={styles.world} style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}>
            {snapshot.items.map((item) => {
              const isSelected = selected.includes(item.id)
              const editing = editingId === item.id
              return (
                <div
                  key={item.id}
                  className={`${styles.item} ${styles[item.kind]}`}
                  data-testid={`canvas-item-${item.id}`}
                  data-kind={item.kind}
                  data-selected={isSelected || undefined}
                  data-editing={editing || undefined}
                  data-x={Math.round(item.x)}
                  data-width={Math.round(item.width)}
                  style={{ left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation}deg)`, '--item-color': item.color } as CSSProperties}
                  onDoubleClick={() => isEditable(item) && setEditingId(item.id)}
                >
                  {editing && isEditable(item) ? (
                    <textarea
                      autoFocus
                      aria-label={item.kind === 'sticky' ? 'Edit sticky note' : 'Edit canvas text'}
                      value={item.text}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => updateText(item, event.target.value)}
                      onBlur={() => finishEditing(item)}
                    />
                  ) : (
                    <span className={`${styles.itemContent} ${item.text ? '' : styles.placeholder}`}>
                      {item.text || ITEM_KINDS[item.kind].placeholder}
                    </span>
                  )}
                </div>
              )
            })}

            {soleSelected && tool === 'select' && !editingId && (
              <div
                className={styles.handleLayer}
                style={{ left: soleSelected.x, top: soleSelected.y, width: soleSelected.width, height: soleSelected.height, transform: `rotate(${soleSelected.rotation}deg)` }}
              >
                <span className={styles.rotateStem} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.rotateHandle}
                  aria-label={`Rotate ${soleSelected.kind} item`}
                  onPointerDown={(event) => beginRotate(soleSelected, event)}
                />
                {RESIZE_HANDLES.map(({ handle, left, top }) => (
                  <button
                    key={handle}
                    type="button"
                    className={styles.handle}
                    style={{ left, top }}
                    aria-label={`Resize ${soleSelected.kind} item ${handle}`}
                    onPointerDown={(event) => beginResize(soleSelected, handle, event)}
                  />
                ))}
              </div>
            )}

            {marqueeRect && (
              <div className={styles.marquee} style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.width, height: marqueeRect.height }} />
            )}
          </div>
        </div>

        <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
          {TOOL_GROUPS.map((groupDef, index) => (
            <div key={groupDef.name} style={{ display: 'contents' }}>
              {index > 0 && <div className={styles.divider} />}
              <div className={styles.group} role="group" aria-label={groupDef.name}>
                {groupDef.tools.map((button) => (
                  <button
                    key={button.label}
                    type="button"
                    className={styles.tool}
                    aria-label={button.label}
                    aria-pressed={button.tool ? tool === button.tool : undefined}
                    title={button.tool ? (button.title ?? button.label) : `${button.label} — coming soon`}
                    disabled={!button.tool}
                    onClick={button.tool ? () => selectTool(button.tool!) : undefined}
                  >
                    <button.icon size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className={styles.divider} />
          <div className={styles.group} role="group" aria-label="Utilities">
            <button type="button" className={styles.tool} aria-label="Color" title="Color picker — coming soon" disabled><span className={styles.swatch} /></button>
            <div className={styles.zoom}>
              <button type="button" className={styles.tool} aria-label="Zoom out" onClick={() => zoomFromCenter(1 / 1.15)}><icons.zoomOut size={16} aria-hidden="true" /></button>
              <button type="button" className={styles.zoomValue} aria-label="Reset zoom" onClick={() => setViewport({ panX: 0, panY: 0, zoom: 1 })}>{Math.round(viewport.zoom * 100)}%</button>
              <button type="button" className={styles.tool} aria-label="Zoom in" onClick={() => zoomFromCenter(1.15)}><icons.zoomIn size={16} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
      </div>
    </DockableWindow>
  )
}
