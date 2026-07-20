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
import { LinkNode, MarkdownNode, PdfNode } from './ReferenceNodes'
import { renderMarkdownHtml } from './markdown'
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
import { createItem, imageFromSource, ITEM_KINDS, isEditable, linkFromUrl, makeLinkId, mdFromSource, pdfFromSource, strokeFromPoints } from './engine/itemKinds'
import { anchorPoint, catenaryPoints, distanceToPolyline, EDGE_ANCHORS, nearestAnchor, polylinePath } from './engine/linkGeometry'
import { CanvasStore } from './engine/store'
import { LaserTrailRenderer } from './LaserTrailRenderer'
import { LinkRopeRenderer } from './LinkRopeRenderer'
import { getAssetStore } from '../state/assetStore'
import type { CanvasImageItem, CanvasItem, CanvasLink, CanvasMdItem, CanvasPoint, CanvasRect, CanvasTool, CanvasViewport, LinkAnchor, NodeSource, ReferenceCanvas } from './types'
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
    { label: 'PDF', icon: icons.filePdf },
    { label: 'Markdown', icon: icons.fileMarkdown },
    { label: 'Link node', icon: icons.link },
  ] },
  { name: 'Connect', tools: [
    { label: 'Link string', icon: icons.linkConnector, tool: 'link', title: 'Link string — drag between two items' },
  ] },
]
/**
 * Reference-node toolbar buttons keyed by label: a file-picker `accept` string,
 * or the sentinel `'link'` (opens a URL prompt instead of a file picker).
 */
const NODE_ACTIONS: Record<string, string> = {
  Image: 'image/*',
  PDF: 'application/pdf,.pdf',
  Markdown: '.md,.markdown,text/markdown',
  'Link node': 'link',
}

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
  // Dragging a new link from a source item's anchor toward a target.
  | { kind: 'linkDraw'; fromId: string; fromAnchor: LinkAnchor; current: CanvasPoint }
  // Re-binding one end of a selected link by dragging its anchor dot.
  | { kind: 'anchorDrag'; linkId: string; end: 'from' | 'to'; current: CanvasPoint }

const LINK_HIT_PADDING = 10

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
  const [mdReader, setMdReader] = useState<CanvasMdItem>()
  const [selectedLink, setSelectedLink] = useState<string>()
  const [linkPreview, setLinkPreview] = useState<{ from: CanvasPoint; to: CanvasPoint }>()
  const [hoverItemId, setHoverItemId] = useState<string>()
  // Resolved bitmap URLs per asset id: a string (object URL / href) or null when
  // the asset is missing (→ "File unavailable" card). Undefined = not yet resolved.
  const [assetUrls, setAssetUrls] = useState<Record<string, string | null>>({})

  const laserPathRef = useRef<SVGPathElement>(null)
  const laserDotsRef = useRef<SVGGElement>(null)
  const laserRef = useRef<LaserTrailRenderer>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ropeRef = useRef<LinkRopeRenderer>(undefined)
  const linkPathsRef = useRef<Map<string, SVGPathElement>>(new Map())

  const stageRef = useRef<HTMLDivElement>(null)
  const operationRef = useRef<Operation>(undefined)
  const viewportRef = useRef(viewport)
  const selectedRef = useRef(selected)
  const selectedLinkRef = useRef(selectedLink)
  viewportRef.current = viewport
  selectedRef.current = selected
  selectedLinkRef.current = selectedLink

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

  // --- Link strings: an imperative rope renderer owns each string's SVG `d` ---
  useEffect(() => {
    ropeRef.current = new LinkRopeRenderer({ reducedMotion: prefersReducedMotion() })
    return () => {
      ropeRef.current?.destroy()
      ropeRef.current = undefined
    }
  }, [])

  // --- Resolve object URLs for asset-backed nodes (image bitmaps, pdf open-target) ---
  // Object URLs are revoked once on unmount (tracked in a ref); revoking per
  // effect-run would tear down URLs still displayed by the <img>s.
  const objectUrlsRef = useRef<string[]>([])
  useEffect(() => () => { for (const url of objectUrlsRef.current) URL.revokeObjectURL(url) }, [])
  useEffect(() => {
    let cancelled = false
    for (const item of snapshot.items) {
      // Only image bitmaps and the pdf open-target need an object URL; md renders
      // from text (mdHtml), so it never needs one.
      if ((item.kind !== 'image' && item.kind !== 'pdf') || item.source.type !== 'asset') continue
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

  // --- Resolve rendered HTML for Markdown nodes (asset text → tiptap HTML) ---
  const [mdHtml, setMdHtml] = useState<Record<string, string | null>>({})
  useEffect(() => {
    let cancelled = false
    for (const item of snapshot.items) {
      if (item.kind !== 'md' || item.source.type !== 'asset') continue
      const { assetId } = item.source
      if (assetId in mdHtml) continue
      getAssetStore()
        .getAssetText(assetId)
        .catch(() => undefined)
        .then((text) => {
          if (cancelled) return
          setMdHtml((current) => ({ ...current, [assetId]: text == null ? null : renderMarkdownHtml(text) }))
        })
    }
    return () => { cancelled = true }
  }, [snapshot.items, mdHtml])

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
        setSelectedLink(undefined)
        setEditingId(undefined)
        operationRef.current = undefined
        setMarqueeRect(undefined)
        setLive(false)
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedRef.current.length > 0) {
          event.preventDefault()
          store.removeItems(selectedRef.current)
          setSelected([])
        } else if (selectedLinkRef.current) {
          event.preventDefault()
          store.removeLinks([selectedLinkRef.current]) // removes only the link, never its items
          setSelectedLink(undefined)
        }
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
    // The Link tool: drag from a source item's nearest edge to a target item.
    if (tool === 'link') {
      const source = [...store.getSnapshot().items].reverse().find((item) => pointInItem(item, page))
      if (source) {
        const fromAnchor = nearestAnchor(source, page)
        operationRef.current = { kind: 'linkDraw', fromId: source.id, fromAnchor, current: page }
        setLinkPreview({ from: anchorPoint(source, fromAnchor), to: page })
        trackGesture()
      }
      return
    }
    if (tool === 'select') {
      const hitItem = [...store.getSnapshot().items].reverse().find((item) => pointInItem(item, page))
      if (hitItem) {
        setSelectedLink(undefined)
        startDrag(hitItem, page, event.shiftKey)
        trackGesture()
        return
      }
      // No item under the pointer — try to select a link string.
      const hitLink = linkAtPoint(page)
      if (hitLink) {
        setSelected([])
        setSelectedLink(hitLink.id)
        return
      }
      if (!event.shiftKey) setSelected([])
      setSelectedLink(undefined)
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
    } else if (op.kind === 'linkDraw') {
      const source = itemsById.get(op.fromId)
      operationRef.current = { ...op, current: page }
      if (source) setLinkPreview({ from: anchorPoint(source, op.fromAnchor), to: page })
    } else if (op.kind === 'anchorDrag') {
      operationRef.current = { ...op, current: page }
      const link = store.getSnapshot().links.find((l) => l.id === op.linkId)
      const target = [...store.getSnapshot().items].reverse().find((item) => pointInItem(item, page))
      if (link) {
        // Live-preview the re-bind: snap to the hovered item's nearest anchor, else follow the pointer.
        const anchor = target ? nearestAnchor(target, page) : undefined
        const otherId = op.end === 'from' ? link.toId : link.fromId
        const otherItem = itemsById.get(otherId)
        const otherAnchor = op.end === 'from' ? link.toAnchor : link.fromAnchor
        const otherPoint = otherItem ? anchorPoint(otherItem, otherAnchor) : page
        const movedPoint = target && anchor ? anchorPoint(target, anchor) : page
        setLinkPreview(op.end === 'from' ? { from: movedPoint, to: otherPoint } : { from: otherPoint, to: movedPoint })
      }
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
    } else if (op.kind === 'linkDraw') {
      const page = clientToPage(clientX, clientY)
      const target = [...store.getSnapshot().items].reverse().find((item) => pointInItem(item, page))
      // A link needs two distinct items; dropping on empty space or the source cancels.
      if (target && target.id !== op.fromId) {
        store.addLink({
          id: makeLinkId(),
          fromId: op.fromId,
          toId: target.id,
          fromAnchor: op.fromAnchor,
          toAnchor: nearestAnchor(target, page),
          arrowhead: false,
        })
      }
      setLinkPreview(undefined)
    } else if (op.kind === 'anchorDrag') {
      const page = clientToPage(clientX, clientY)
      const link = store.getSnapshot().links.find((l) => l.id === op.linkId)
      const target = [...store.getSnapshot().items].reverse().find((item) => pointInItem(item, page))
      if (link) {
        if (target && target.id !== (op.end === 'from' ? link.toId : link.fromId)) {
          // Re-bind this endpoint to the dropped item.
          const anchor = nearestAnchor(target, page)
          store.setLink(op.end === 'from'
            ? { ...link, fromId: target.id, fromAnchor: anchor }
            : { ...link, toId: target.id, toAnchor: anchor })
          store.commit()
        } else if (!target) {
          // Dropped on empty canvas → delete the link.
          store.removeLinks([link.id])
          setSelectedLink(undefined)
        }
      }
      setLinkPreview(undefined)
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

  /** Start a new link by dragging from an edge nub (select-tool shortcut). */
  const beginNubDrag = (item: CanvasItem, anchor: LinkAnchor, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setSelected([])
    setSelectedLink(undefined)
    const start = anchorPoint(item, anchor)
    operationRef.current = { kind: 'linkDraw', fromId: item.id, fromAnchor: anchor, current: start }
    setLinkPreview({ from: start, to: start })
    trackGesture()
  }

  /** Start re-binding one end of the selected link by dragging its anchor dot. */
  const beginAnchorDrag = (link: CanvasLink, end: 'from' | 'to', event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const ends = linkEndpoints(link)
    operationRef.current = { kind: 'anchorDrag', linkId: link.id, end, current: end === 'from' ? ends?.from ?? { x: 0, y: 0 } : ends?.to ?? { x: 0, y: 0 } }
    trackGesture()
  }

  /** Toggle the selected link's arrowhead / set its tint. */
  const setLinkStyle = (link: CanvasLink, patch: Partial<Pick<CanvasLink, 'arrowhead' | 'tint'>>) => {
    store.setLink({ ...link, ...patch })
    store.commit()
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
  const commitEdit = () => store.commit()

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

  // --- Reference nodes: create from a dropped/pasted/picked file, routed by type ---
  /** Upload a file to the AssetStore and build its asset `NodeSource`, or null on failure. */
  const uploadAssetSource = async (file: File): Promise<Extract<NodeSource, { type: 'asset' }> | null> => {
    try {
      const asset = await getAssetStore().putAsset(file)
      return { type: 'asset', assetId: asset.id, filename: file.name, mime: asset.mime, size: asset.size }
    } catch {
      return null // upload failed (quota, private mode) — skip rather than crash
    }
  }

  /** The reference-node kind a file maps to, by mime/extension — or null if unsupported. */
  const kindForFile = (file: File): 'image' | 'pdf' | 'md' | null => {
    if (file.type.startsWith('image/')) return 'image'
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
    if (/^text\/(x-)?markdown$/.test(file.type) || /\.(md|markdown)$/i.test(file.name)) return 'md'
    return null
  }

  const supportedFilesOf = (list: FileList | null | undefined): File[] =>
    Array.from(list ?? []).filter((file) => kindForFile(file) !== null)

  const addFile = async (file: File, at: CanvasPoint) => {
    const kind = kindForFile(file)
    if (!kind) return
    const source = await uploadAssetSource(file)
    if (!source) return
    const item = kind === 'image' ? imageFromSource(source, at) : kind === 'pdf' ? pdfFromSource(source, at) : mdFromSource(source, at)
    store.addItem(item)
    setSelected([item.id])
    setPickerOpen(false)
  }

  const stageCenterPage = (): CanvasPoint => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const rect = stage.getBoundingClientRect()
    return screenToPage({ x: rect.width / 2, y: rect.height / 2 }, viewportRef.current)
  }

  /** Open the shared file picker filtered to `accept` (which node tool requested it). */
  const pickerAcceptRef = useRef('image/*')
  const openFilePicker = (accept: string) => {
    pickerAcceptRef.current = accept
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept
      fileInputRef.current.click()
    }
  }

  /** Add a link card from a URL string (used by paste and the Link tool). */
  const addLink = (href: string, at: CanvasPoint) => {
    const trimmed = href.trim()
    if (!/^https?:\/\//i.test(trimmed)) return
    const item = linkFromUrl(trimmed, at)
    store.addItem(item)
    setSelected([item.id])
  }

  /** The Link toolbar tool: prompt for a URL and drop a link card at the centre. */
  const promptForLink = () => {
    const href = window.prompt('Paste a link URL')
    if (href) addLink(href, stageCenterPage())
  }

  /** Double-click activation for reference nodes (single-click selects). */
  const activate = (item: CanvasItem) => {
    if (item.kind === 'image') { setLightbox(item); return }
    if (item.kind === 'md') { setMdReader(item); return }
    if (item.kind === 'link') { window.open(item.source.href, '_blank', 'noopener,noreferrer'); return }
    if (item.kind === 'pdf') {
      const target = item.source.type === 'url' ? item.source.href : assetUrls[item.source.assetId] ?? undefined
      if (target) window.open(target, '_blank', 'noopener,noreferrer')
      return
    }
    if (isEditable(item)) setEditingId(item.id)
  }

  const setTitle = (item: Extract<CanvasItem, { kind: 'link' | 'pdf' | 'md' }>, title: string) => store.setItem(item.id, { ...item, title })

  // Paste from the clipboard onto the board (document-level so it works without
  // the stage holding focus): image/pdf/md files → nodes, a bare URL → a link.
  // Kept in a ref so the mount-only listener always calls the latest closure.
  const pasteHandlerRef = useRef<(event: ClipboardEvent) => void>(undefined)
  pasteHandlerRef.current = (event: ClipboardEvent) => {
    const files = supportedFilesOf(event.clipboardData?.files)
    const text = event.clipboardData?.getData('text/plain')?.trim() ?? ''
    const center = stageCenterPage()
    if (files.length > 0) {
      event.preventDefault()
      for (const file of files) void addFile(file, center)
    } else if (/^https?:\/\/\S+$/i.test(text)) {
      event.preventDefault()
      addLink(text, center)
    }
  }
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => pasteHandlerRef.current?.(event)
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const onFilePicked = (event: ReactChangeEvent<HTMLInputElement>) => {
    const center = stageCenterPage()
    let offset = 0
    for (const file of supportedFilesOf(event.target.files)) {
      void addFile(file, { x: center.x + offset, y: center.y + offset })
      offset += 24
    }
    event.target.value = '' // allow re-picking the same file
  }

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const files = supportedFilesOf(event.dataTransfer.files)
    if (files.length === 0) return
    event.preventDefault()
    let offset = 0
    for (const file of files) {
      void addFile(file, clientToPage(event.clientX + offset, event.clientY + offset))
      offset += 24
    }
  }

  /** Re-attach a fresh file to an asset-backed node (image/pdf/md) whose asset went missing. */
  const reattachNode = (item: Extract<CanvasItem, { kind: 'image' | 'pdf' | 'md' }>, file: File) => {
    void (async () => {
      const source = await uploadAssetSource(file)
      if (!source) return
      const staleId = item.source.type === 'asset' ? item.source.assetId : undefined
      if (staleId) {
        setAssetUrls((current) => {
          const next = { ...current }
          const stale = next[staleId]
          if (stale) URL.revokeObjectURL(stale)
          delete next[staleId]
          return next
        })
        setMdHtml((current) => {
          const next = { ...current }
          delete next[staleId]
          return next
        })
      }
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
    setSelectedLink(undefined)
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

  // --- Derived link geometry ---
  const itemsById = useMemo(() => new Map(snapshot.items.map((item) => [item.id, item])), [snapshot.items])

  /** Page-space endpoints of a link, or undefined if either item is gone. */
  const linkEndpoints = (link: CanvasLink): { from: CanvasPoint; to: CanvasPoint } | undefined => {
    const fromItem = itemsById.get(link.fromId)
    const toItem = itemsById.get(link.toId)
    if (!fromItem || !toItem) return undefined
    return { from: anchorPoint(fromItem, link.fromAnchor), to: anchorPoint(toItem, link.toAnchor) }
  }

  // Feed the rope renderer every commit: each visible link's path element + live
  // endpoints. The renderer diffs endpoints itself to decide what to animate.
  useEffect(() => {
    const entries = snapshot.links.flatMap((link) => {
      const path = linkPathsRef.current.get(link.id)
      const endpoints = linkEndpoints(link)
      return path && endpoints ? [{ id: link.id, path, endpoints }] : []
    })
    ropeRef.current?.sync(entries)
  })

  /** The polyline a link is actually drawn as — parsed from its rendered path
   *  (which the rope renderer may have frozen), falling back to the catenary. */
  const linkPolyline = (link: CanvasLink): CanvasPoint[] => {
    const d = linkPathsRef.current.get(link.id)?.getAttribute('d')
    const points = d
      ? [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
      : []
    if (points.length >= 2) return points
    const ends = linkEndpoints(link)
    return ends ? catenaryPoints(ends.from, ends.to, 16) : []
  }

  /** The link whose drawn curve is within the hit padding of `point`, if any (topmost). */
  const linkAtPoint = (point: CanvasPoint): CanvasLink | undefined => {
    for (const link of [...snapshot.links].reverse()) {
      const polyline = linkPolyline(link)
      if (polyline.length >= 2 && distanceToPolyline(point, polyline) <= LINK_HIT_PADDING) return link
    }
    return undefined
  }

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
          onPointerMove={(event) => {
            if (operationRef.current || (tool !== 'select' && tool !== 'link')) return
            const page = clientToPage(event.clientX, event.clientY)
            const hover = [...store.getSnapshot().items].reverse().find((item) => pointInItem(item, page))
            setHoverItemId(hover?.id)
          }}
          onPointerLeave={() => setHoverItemId(undefined)}
          onWheel={onWheel}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div className={styles.world} style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}>
            {/* Link strings — the imperative rope renderer owns each path's `d`. */}
            <svg className={styles.links} aria-hidden="true">
              <defs>
                {/* context-stroke makes the arrowhead inherit each string's own
                    colour (neutral default or per-link tint). */}
                <marker id="link-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0 0 L8 4 L0 8 Z" fill="context-stroke" />
                </marker>
              </defs>
              {snapshot.links.map((link) => (
                <path
                  key={link.id}
                  ref={(el) => { if (el) linkPathsRef.current.set(link.id, el); else linkPathsRef.current.delete(link.id) }}
                  data-testid={`canvas-link-${link.id}`}
                  className={`${styles.linkString} ${selectedLink === link.id ? styles.linkSelected : ''}`}
                  style={link.tint ? { stroke: link.tint } : undefined}
                  markerEnd={link.arrowhead ? 'url(#link-arrow)' : undefined}
                />
              ))}
            </svg>

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
                  onDoubleClick={() => activate(item)}
                >
                  {item.kind === 'image' ? (
                    <ImageNode
                      item={item}
                      url={item.source.type === 'asset' ? assetUrls[item.source.assetId] : item.source.href}
                      onCaption={(caption) => setCaption(item, caption)}
                      onCaptionCommit={commitEdit}
                      onReattach={(file) => reattachNode(item, file)}
                      onNaturalSize={(w, h) => applyNaturalSize(item, w, h)}
                    />
                  ) : item.kind === 'link' ? (
                    <LinkNode item={item} onTitle={(t) => setTitle(item, t)} onTitleCommit={commitEdit} onOpen={() => activate(item)} />
                  ) : item.kind === 'pdf' ? (
                    <PdfNode
                      item={item}
                      url={item.source.type === 'asset' ? assetUrls[item.source.assetId] : item.source.href}
                      onTitle={(t) => setTitle(item, t)}
                      onTitleCommit={commitEdit}
                      onReattach={(file) => reattachNode(item, file)}
                      onOpen={() => activate(item)}
                    />
                  ) : item.kind === 'md' ? (
                    <MarkdownNode
                      item={item}
                      html={item.source.type === 'asset' ? mdHtml[item.source.assetId] : undefined}
                      onTitle={(t) => setTitle(item, t)}
                      onTitleCommit={commitEdit}
                      onReattach={(file) => reattachNode(item, file)}
                      onOpen={() => activate(item)}
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

            {/* Edge-hover connection nubs — drag one to a target item to link.
                Suppressed on the selected item under the select tool, whose edge
                midpoints already carry the resize handles (they used to collide);
                use the Link tool, or hover another item, to connect from it. */}
            {(() => {
              if (operationRef.current || (tool !== 'select' && tool !== 'link')) return null
              const item = hoverItemId ? itemsById.get(hoverItemId) : undefined
              if (!item) return null
              if (tool === 'select' && soleSelected?.id === item.id) return null
              return EDGE_ANCHORS.map((anchor, i) => {
                const p = anchorPoint(item, anchor)
                return (
                  <button
                    key={i}
                    type="button"
                    className={styles.nub}
                    style={{ left: p.x, top: p.y }}
                    aria-label={`Connect from ${item.kind} item`}
                    onPointerDown={(event) => beginNubDrag(item, anchor, event)}
                  />
                )
              })
            })()}

            {/* Selected link: draggable anchor dots (re-bind) + a small style bar. */}
            {(() => {
              const link = selectedLink ? snapshot.links.find((l) => l.id === selectedLink) : undefined
              const ends = link && linkEndpoints(link)
              if (!link || !ends) return null
              const mid = { x: (ends.from.x + ends.to.x) / 2, y: (ends.from.y + ends.to.y) / 2 }
              return (
                <>
                  <button type="button" className={styles.linkAnchorDot} style={{ left: ends.from.x, top: ends.from.y }} aria-label="Re-bind link start" onPointerDown={(e) => beginAnchorDrag(link, 'from', e)} />
                  <button type="button" className={styles.linkAnchorDot} style={{ left: ends.to.x, top: ends.to.y }} aria-label="Re-bind link end" onPointerDown={(e) => beginAnchorDrag(link, 'to', e)} />
                  <div className={styles.linkBar} style={{ left: mid.x, top: mid.y }} onPointerDown={(e) => e.stopPropagation()}>
                    <button type="button" aria-label="Toggle arrowhead" aria-pressed={link.arrowhead} onClick={() => setLinkStyle(link, { arrowhead: !link.arrowhead })}><icons.arrowRight size={14} aria-hidden="true" /></button>
                    <button type="button" aria-label="Tint link with current color" onClick={() => setLinkStyle(link, { tint: color })}><span className={styles.linkTintSwatch} style={{ background: color }} /></button>
                    <button type="button" aria-label="Clear link tint" onClick={() => setLinkStyle(link, { tint: undefined })}><icons.minus size={14} aria-hidden="true" /></button>
                    <button type="button" aria-label="Unlink" title="Unlink" onClick={() => { store.removeLinks([link.id]); setSelectedLink(undefined) }}><icons.unlink size={14} aria-hidden="true" /></button>
                  </div>
                </>
              )
            })()}

            {marqueeRect && (
              <div className={styles.marquee} style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.width, height: marqueeRect.height }} />
            )}

            {linkPreview && (
              <svg className={styles.drawPreview} aria-hidden="true">
                <path d={polylinePath(catenaryPoints(linkPreview.from, linkPreview.to, 16))} style={{ stroke: color }} />
              </svg>
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
                  // Reference-node buttons open a file picker / URL prompt (creation
                  // is via file or paste, not a pointer mode); pointer tools select
                  // a tool; anything left is a disabled placeholder.
                  const action = NODE_ACTIONS[button.label]
                  const enabled = Boolean(button.tool) || Boolean(action)
                  const onClick = button.tool
                    ? () => selectTool(button.tool!)
                    : action === 'link'
                      ? promptForLink
                      : action
                        ? () => openFilePicker(action)
                        : undefined
                  return (
                    <button
                      key={button.label}
                      type="button"
                      className={styles.tool}
                      aria-label={button.label}
                      aria-pressed={button.tool ? tool === button.tool : undefined}
                      title={enabled ? (button.title ?? button.label) : `${button.label} — coming soon`}
                      disabled={!enabled}
                      onClick={onClick}
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
          data-testid="canvas-file-input"
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

        {mdReader && (
          <div className={styles.lightbox} role="dialog" aria-label="Markdown reader" onPointerDown={() => setMdReader(undefined)}>
            <div className={styles.mdReader} onPointerDown={(event) => event.stopPropagation()}>
              <h2 className={styles.mdReaderTitle}>{mdReader.title}</h2>
              {mdReader.source.type === 'asset' && mdHtml[mdReader.source.assetId] ? (
                // Schema-constrained HTML from renderMarkdownHtml (see MarkdownNode).
                <div className={styles.mdReaderBody} dangerouslySetInnerHTML={{ __html: mdHtml[mdReader.source.assetId] as string }} />
              ) : (
                <p className={styles.cardMeta}>File unavailable</p>
              )}
            </div>
            <button type="button" className={styles.lightboxClose} aria-label="Close reader" onClick={() => setMdReader(undefined)}>
              <icons.windowClose size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </DockableWindow>
  )
}
