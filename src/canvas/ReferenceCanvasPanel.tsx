import type {
  ChangeEvent as ReactChangeEvent,
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { smoothStrokePath } from './canvasDomain'
import { ColorPicker } from './ColorPicker'
import { ImageNode } from './ImageNode'
import { DEFAULT_CANVAS_COLOR } from './color'
import { DockableWindow } from '../components/DockableWindow/DockableWindow'
import { prefersReducedMotion } from '../components/motionPrefs'
import type { World } from '../domain/types'
import { icons } from '../icons'
import type { WorldRepository } from '../repository/WorldRepository'
import {
  eraseAlongSegment,
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
import { createItem, imageFromSource, ITEM_KINDS, isEditable, strokeFromPoints } from './engine/itemKinds'
import { CanvasStore } from './engine/store'
import { LaserTrailRenderer } from './LaserTrailRenderer'
import { getAssetStore } from '../state/assetStore'
import type { CanvasImageItem, CanvasItem, CanvasPoint, CanvasRect, CanvasTool, CanvasViewport, NodeSource, ReferenceCanvas } from './types'
import styles from './ReferenceCanvasPanel.module.css'

interface ReferenceCanvasPanelProps {
  world: World
  repository: WorldRepository
  onClose: () => void
}

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
    { label: 'Pencil', icon: icons.toolPencil, tool: 'pencil' },
    { label: 'Eraser', icon: icons.toolEraser, tool: 'eraser' },
    { label: 'Laser', icon: icons.toolLaser, tool: 'laser' },
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
  | { kind: 'draw'; points: CanvasPoint[] }
  | { kind: 'erase'; previous: CanvasPoint; removedAny: boolean }
  | { kind: 'laser' }

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
  const [color, setColor] = useState(DEFAULT_CANVAS_COLOR)
  const [drawPreview, setDrawPreview] = useState<CanvasPoint[]>()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lightbox, setLightbox] = useState<CanvasImageItem>()
  // Resolved bitmap URLs per asset id: a string (object URL / href) or null when
  // the asset is missing (→ "File unavailable" card). Undefined = not yet resolved.
  const [assetUrls, setAssetUrls] = useState<Record<string, string | null>>({})

  const laserPathRef = useRef<SVGPathElement>(null)
  const laserDotsRef = useRef<SVGGElement>(null)
  const laserRef = useRef<LaserTrailRenderer>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const operationRef = useRef<Operation>(undefined)
  const viewportRef = useRef(viewport)
  const selectedRef = useRef(selected)
  viewportRef.current = viewport
  selectedRef.current = selected

  // --- Ephemeral laser trail: an imperative rAF renderer, never a persisted item ---
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

  // --- Resolve bitmap URLs for asset-backed images (url-backed images use href directly) ---
  // Object URLs are revoked once on unmount (tracked in a ref); revoking per
  // effect-run would tear down URLs still displayed by the <img>s.
  const objectUrlsRef = useRef<string[]>([])
  useEffect(() => () => { for (const url of objectUrlsRef.current) URL.revokeObjectURL(url) }, [])
  useEffect(() => {
    let cancelled = false
    for (const item of snapshot.items) {
      if (item.kind !== 'image' || item.source.type !== 'asset') continue
      const { assetId } = item.source
      if (assetId in assetUrls) continue
      getAssetStore()
        .getAssetUrl(assetId)
        .catch(() => undefined) // a failed lookup degrades to "File unavailable", never an unhandled rejection
        .then((url) => {
          if (cancelled) return
          if (url) objectUrlsRef.current.push(url)
          setAssetUrls((current) => ({ ...current, [assetId]: url ?? null }))
        })
    }
    return () => { cancelled = true }
  }, [snapshot.items, assetUrls])

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

  // --- Pointer gestures ---
  // A gesture tracks via document-level listeners (not React pointer capture),
  // so moves keep flowing even if the pointer leaves the stage or a re-render
  // swaps DOM nodes — the robust pattern the earlier capture-based version
  // needed (laser/pencil were dropping move events).
  const clientToPage = (clientX: number, clientY: number): CanvasPoint => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const rect = stage.getBoundingClientRect()
    return screenToPage({ x: clientX - rect.left, y: clientY - rect.top }, viewportRef.current)
  }
  const clientToScreen = (clientX: number, clientY: number): CanvasPoint => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const rect = stage.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const trackGesture = () => {
    const onMove = (event: PointerEvent) => gestureMove(event.clientX, event.clientY, event.shiftKey)
    const onUp = (event: PointerEvent) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      gestureEnd(event.clientX, event.clientY, event.shiftKey)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  const beginStagePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    const screen = clientToScreen(event.clientX, event.clientY)
    const page = clientToPage(event.clientX, event.clientY)

    if (event.button === 1 || spacePressed || tool === 'hand') {
      event.preventDefault()
      operationRef.current = { kind: 'pan', startScreen: screen, startPan: { x: viewportRef.current.panX, y: viewportRef.current.panY } }
      trackGesture()
      return
    }
    setPickerOpen(false)
    if (tool === 'select') {
      const hitItem = [...store.getSnapshot().items].reverse().find((item) => pointInItem(item, page))
      if (hitItem) {
        startDrag(hitItem, page, event.shiftKey)
        trackGesture()
        return
      }
      if (!event.shiftKey) setSelected([])
      setEditingId(undefined)
      operationRef.current = { kind: 'marquee', start: page }
      setMarqueeRect({ x: page.x, y: page.y, width: 0, height: 0 })
      trackGesture()
      return
    }
    if (tool === 'pencil') {
      operationRef.current = { kind: 'draw', points: [page] }
      setDrawPreview([page])
      setLive(true)
      trackGesture()
      return
    }
    if (tool === 'eraser') {
      const hit = eraseAlongSegment(store.getSnapshot().items, page, page)
      if (hit.length) store.removeItemsTransient(hit)
      operationRef.current = { kind: 'erase', previous: page, removedAny: hit.length > 0 }
      trackGesture()
      return
    }
    if (tool === 'laser') {
      laserRef.current?.addPoint(page)
      operationRef.current = { kind: 'laser' }
      trackGesture()
      return
    }
    // text / sticky: create an item and edit it immediately (no gesture tracking).
    // preventDefault stops the browser's default pointerdown focus behaviour from
    // stealing focus back from the auto-focused textarea (React flushes this
    // discrete event synchronously, so the textarea mounts mid-event) — without
    // it the textarea blurs instantly on creation.
    event.preventDefault()
    const item = createItem(tool, page, color)
    store.addItem(item)
    setSelected([item.id])
    setEditingId(item.id)
    setTool('select')
  }

  const gestureMove = (clientX: number, clientY: number, shiftKey: boolean) => {
    const op = operationRef.current
    if (!op) return
    const page = clientToPage(clientX, clientY)

    if (op.kind === 'pan') {
      const screen = clientToScreen(clientX, clientY)
      setViewport((current) => ({ ...current, panX: op.startPan.x + screen.x - op.startScreen.x, panY: op.startPan.y + screen.y - op.startScreen.y }))
    } else if (op.kind === 'marquee') {
      setMarqueeRect(rectFromPoints(op.start, page))
    } else if (op.kind === 'drag') {
      const dx = page.x - op.startPage.x
      const dy = page.y - op.startPage.y
      for (const [id, original] of op.originals) store.setItem(id, { ...original, x: original.x + dx, y: original.y + dy })
    } else if (op.kind === 'resize') {
      // Images keep their aspect by default (Shift frees it); everything else is
      // the reverse — free resize, Shift to lock.
      const aspect = op.original.kind === 'image' ? !shiftKey : shiftKey
      store.setItem(op.original.id, resizeItem(op.original, op.handle, page, { aspect }))
    } else if (op.kind === 'rotate') {
      const angle = Math.round(rotationForPointer(op.center, page))
      store.setItem(op.original.id, { ...op.original, rotation: angle })
    } else if (op.kind === 'draw') {
      op.points.push(page)
      setDrawPreview([...op.points])
    } else if (op.kind === 'erase') {
      const hit = eraseAlongSegment(store.getSnapshot().items, op.previous, page)
      if (hit.length) store.removeItemsTransient(hit)
      operationRef.current = { kind: 'erase', previous: page, removedAny: op.removedAny || hit.length > 0 }
    } else if (op.kind === 'laser') {
      laserRef.current?.addPoint(page)
    }
  }

  const gestureEnd = (clientX: number, clientY: number, shiftKey: boolean) => {
    const op = operationRef.current
    operationRef.current = undefined
    if (!op) return
    if (op.kind === 'marquee') {
      const box = rectFromPoints(op.start, clientToPage(clientX, clientY))
      const hit = marqueeContains(store.getSnapshot().items, box)
      setSelected((current) => (shiftKey ? [...new Set([...current, ...hit])] : hit))
      setMarqueeRect(undefined)
    } else if (op.kind === 'drag') {
      const moved = [...op.originals].some(([id, original]) => {
        const current = store.getSnapshot().items.find((item) => item.id === id)
        return current ? current.x !== original.x || current.y !== original.y : false
      })
      if (moved) store.commit()
    } else if (op.kind === 'resize' || op.kind === 'rotate') {
      store.commit()
    } else if (op.kind === 'draw') {
      const points = op.points.length > 1 ? op.points : [op.points[0], { x: op.points[0].x + 1, y: op.points[0].y + 1 }]
      store.addItem(strokeFromPoints(points, color))
      setDrawPreview(undefined)
    } else if (op.kind === 'erase') {
      if (op.removedAny) store.commit()
    } else if (op.kind === 'laser') {
      laserRef.current?.finish()
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
    operationRef.current = { kind: 'resize', handle, original: item }
    setLive(true)
    trackGesture()
  }

  const beginRotate = (item: CanvasItem, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    operationRef.current = { kind: 'rotate', original: item, center: itemCenter(item) }
    setLive(true)
    trackGesture()
  }

  const updateText = (item: CanvasItem, text: string) => {
    if (!isEditable(item)) return
    store.setItem(item.id, { ...item, text })
  }

  const finishEditing = (_item: CanvasItem) => {
    // Persist whatever was typed and exit editing. Empty items are intentionally
    // KEPT — an auto-delete-on-empty-blur silently destroyed freshly created
    // items when the browser stole focus mid-creation. Empty text/sticky show a
    // placeholder and are removable with the eraser or Delete.
    store.commit()
    setEditingId(undefined)
  }

  // Caption edits are transient while typing; committed once on blur, so a
  // caption is one undo step rather than one-per-keystroke (mirrors text/sticky).
  const setCaption = (item: CanvasImageItem, caption: string) => {
    store.setItem(item.id, { ...item, caption })
  }
  const commitCaption = () => store.commit()

  // Correct an image to its intrinsic aspect (long edge ~320px) once, the first
  // time its bitmap loads. Tracked so it never fights a later user resize.
  const sizedRef = useRef<Set<string>>(new Set())
  const applyNaturalSize = (item: CanvasImageItem, naturalW: number, naturalH: number) => {
    if (sizedRef.current.has(item.id)) return
    sizedRef.current.add(item.id)
    const ratio = naturalW / naturalH
    const width = ratio >= 1 ? 320 : Math.round(320 * ratio)
    const height = ratio >= 1 ? Math.round(320 / ratio) : 320
    if (width === item.width && height === item.height) return
    store.setItem(item.id, { ...item, width, height })
    store.commit()
  }

  // --- Image nodes: create from a file (upload → AssetStore) at a page point ---
  /** Upload a file to the AssetStore and build its `NodeSource`, or null on failure. */
  const uploadAssetSource = async (file: File): Promise<NodeSource | null> => {
    try {
      const asset = await getAssetStore().putAsset(file)
      return { type: 'asset', assetId: asset.id, filename: file.name, mime: asset.mime, size: asset.size }
    } catch {
      return null // upload failed (quota, private mode) — skip rather than crash
    }
  }

  const addImageFile = async (file: File, at: CanvasPoint) => {
    if (!file.type.startsWith('image/')) return
    const source = await uploadAssetSource(file)
    if (!source) return
    const item = imageFromSource(source, at)
    store.addItem(item)
    setSelected([item.id])
    setPickerOpen(false)
  }

  const imageFilesOf = (list: FileList | null | undefined): File[] =>
    Array.from(list ?? []).filter((file) => file.type.startsWith('image/'))

  const stageCenterPage = (): CanvasPoint => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const rect = stage.getBoundingClientRect()
    return screenToPage({ x: rect.width / 2, y: rect.height / 2 }, viewportRef.current)
  }

  const openImagePicker = () => fileInputRef.current?.click()

  // Paste images from the clipboard onto the board (document-level so it works
  // without the stage holding focus). Kept in a ref so the mount-only listener
  // always calls the latest closure.
  const pasteHandlerRef = useRef<(event: ClipboardEvent) => void>(undefined)
  pasteHandlerRef.current = (event: ClipboardEvent) => {
    const files = imageFilesOf(event.clipboardData?.files)
    if (files.length === 0) return
    event.preventDefault()
    const center = stageCenterPage()
    for (const file of files) void addImageFile(file, center)
  }
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => pasteHandlerRef.current?.(event)
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const onFilePicked = (event: ReactChangeEvent<HTMLInputElement>) => {
    const center = stageCenterPage()
    let offset = 0
    for (const file of imageFilesOf(event.target.files)) {
      void addImageFile(file, { x: center.x + offset, y: center.y + offset })
      offset += 24
    }
    event.target.value = '' // allow re-picking the same file
  }

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const files = imageFilesOf(event.dataTransfer.files)
    if (files.length === 0) return
    event.preventDefault()
    let offset = 0
    for (const file of files) {
      void addImageFile(file, clientToPage(event.clientX + offset, event.clientY + offset))
      offset += 24
    }
  }

  /** Re-attach a fresh file to an image whose asset went missing. */
  const reattachImage = (item: CanvasImageItem, file: File) => {
    void (async () => {
      const source = await uploadAssetSource(file)
      if (!source) return
      setAssetUrls((current) => {
        const next = { ...current }
        // Drop the old resolution so the new asset re-resolves; revoke its URL.
        if (item.source.type === 'asset') {
          const stale = next[item.source.assetId]
          if (stale) URL.revokeObjectURL(stale)
          delete next[item.source.assetId]
        }
        return next
      })
      store.setItem(item.id, { ...item, source })
      store.commit()
    })()
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
    if (tool === 'laser') laserRef.current?.clear()
    setTool(next)
    setPickerOpen(false)
    operationRef.current = undefined
  }

  /** Set the active color for new items, and recolor the current selection. */
  const applyColor = (next: string) => {
    setColor(next)
    if (selectedRef.current.length === 0) return
    const ids = new Set(selectedRef.current)
    for (const item of store.getSnapshot().items) {
      if (ids.has(item.id)) store.setItem(item.id, { ...item, color: next })
    }
    store.commit()
  }

  const soleSelected = selected.length === 1 ? snapshot.items.find((item) => item.id === selected[0]) : undefined
  const gridSize = 22 * viewport.zoom
  const previewPath = useMemo(() => (drawPreview ? smoothStrokePath(drawPreview) : undefined), [drawPreview])

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
          onWheel={onWheel}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div className={styles.world} style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}>
            {snapshot.items.map((item) => {
              const isSelected = selected.includes(item.id)
              const editing = editingId === item.id
              return (
                <div
                  key={item.id}
                  className={`${styles.item} ${styles[item.kind] ?? ''}`}
                  data-testid={`canvas-item-${item.id}`}
                  data-kind={item.kind}
                  data-selected={isSelected || undefined}
                  data-editing={editing || undefined}
                  data-x={Math.round(item.x)}
                  data-width={Math.round(item.width)}
                  style={{ left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation}deg)`, '--item-color': item.color } as CSSProperties}
                  onDoubleClick={() => {
                    if (item.kind === 'image') setLightbox(item)
                    else if (isEditable(item)) setEditingId(item.id)
                  }}
                >
                  {item.kind === 'image' ? (
                    <ImageNode
                      item={item}
                      url={item.source.type === 'asset' ? assetUrls[item.source.assetId] : item.source.href}
                      onCaption={(caption) => setCaption(item, caption)}
                      onCaptionCommit={commitCaption}
                      onReattach={(file) => reattachImage(item, file)}
                      onNaturalSize={(w, h) => applyNaturalSize(item, w, h)}
                    />
                  ) : item.kind === 'stroke' ? (
                    <svg className={styles.strokeSvg} viewBox={`0 0 ${Math.max(1, item.width)} ${Math.max(1, item.height)}`} preserveAspectRatio="none" aria-hidden="true">
                      <path d={smoothStrokePath(item.points)} />
                    </svg>
                  ) : editing ? (
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

            {previewPath && (
              <svg className={styles.drawPreview} aria-hidden="true">
                <path d={previewPath} style={{ stroke: color }} />
              </svg>
            )}

            <svg className={styles.laser} aria-hidden="true">
              <path ref={laserPathRef} data-testid="canvas-laser-path" />
              <g ref={laserDotsRef} />
            </svg>
          </div>

          {snapshot.items.length === 0 && (
            <p className={styles.emptyInvite}>Drop images, PDFs, links, or notes to start your board</p>
          )}
        </div>

        <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
          {TOOL_GROUPS.map((groupDef, index) => (
            <div key={groupDef.name} style={{ display: 'contents' }}>
              {index > 0 && <div className={styles.divider} />}
              <div className={styles.group} role="group" aria-label={groupDef.name}>
                {groupDef.tools.map((button) => {
                  // Image opens a file picker (creation is via file, not a pointer
                  // mode); tool buttons select a pointer tool; the rest are
                  // disabled placeholders until their slice lands.
                  const isImage = button.label === 'Image'
                  const enabled = Boolean(button.tool) || isImage
                  return (
                    <button
                      key={button.label}
                      type="button"
                      className={styles.tool}
                      aria-label={button.label}
                      aria-pressed={button.tool ? tool === button.tool : undefined}
                      title={enabled ? (button.title ?? button.label) : `${button.label} — coming soon`}
                      disabled={!enabled}
                      onClick={button.tool ? () => selectTool(button.tool!) : isImage ? openImagePicker : undefined}
                    >
                      <button.icon size={18} aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className={styles.divider} />
          <div className={styles.group} role="group" aria-label="Utilities">
            <button
              type="button"
              className={styles.tool}
              aria-label="Color"
              aria-pressed={pickerOpen}
              title="Color"
              onClick={() => setPickerOpen((open) => !open)}
            >
              <span className={styles.swatch} style={{ '--swatch-color': color } as CSSProperties} />
            </button>
            <div className={styles.zoom}>
              <button type="button" className={styles.tool} aria-label="Zoom out" onClick={() => zoomFromCenter(1 / 1.15)}><icons.zoomOut size={16} aria-hidden="true" /></button>
              <button type="button" className={styles.zoomValue} aria-label="Reset zoom" onClick={() => setViewport({ panX: 0, panY: 0, zoom: 1 })}>{Math.round(viewport.zoom * 100)}%</button>
              <button type="button" className={styles.tool} aria-label="Zoom in" onClick={() => zoomFromCenter(1.15)}><icons.zoomIn size={16} aria-hidden="true" /></button>
            </div>
          </div>

          {pickerOpen && <ColorPicker value={color} onChange={applyColor} />}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onFilePicked}
        />

        {lightbox && (
          <div
            className={styles.lightbox}
            role="dialog"
            aria-label="Image preview"
            onPointerDown={() => setLightbox(undefined)}
          >
            <img
              src={lightbox.source.type === 'url' ? lightbox.source.href : assetUrls[lightbox.source.assetId] ?? undefined}
              alt={lightbox.caption || 'Image preview'}
            />
            <button type="button" className={styles.lightboxClose} aria-label="Close preview" onClick={() => setLightbox(undefined)}>
              <icons.windowClose size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </DockableWindow>
  )
}
