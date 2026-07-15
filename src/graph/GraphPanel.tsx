import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DockableWindow } from '../components/DockableWindow/DockableWindow'
import { prefersReducedMotion } from '../components/motionPrefs'
import { CATEGORIES, type Category, type Page, type World } from '../domain/types'
import { icons } from '../icons'
import { CATEGORY_META } from '../screens/Dashboard/categoryMeta'
import { useUiStore } from '../state/uiStore'
import { createForceSimulation, type ForceSimulation } from './forceSimulation'
import { buildRelationshipGraph, type RelationshipGraph } from './graphModel'
import styles from './GraphPanel.module.css'

export interface GraphPanelProps {
  world: World
  pages: Page[]
  focalSlug?: string
  onClose: () => void
  onNavigatePage: (slug: string) => void
}

export function GraphPanel({ world, pages, focalSlug, onClose, onNavigatePage }: GraphPanelProps) {
  const [scope, setScope] = useState<'global' | 'local'>(focalSlug ? 'local' : 'global')
  const [categories, setCategories] = useState<Set<Category>>(() => new Set(CATEGORIES))
  const focalPage = focalSlug ? pages.find((page) => page.slug === focalSlug) : undefined
  const graph = useMemo(
    () => buildRelationshipGraph(
      pages,
      scope === 'local' && focalSlug
        ? { scope: 'local', focalSlug, categories }
        : { scope: 'global', categories },
    ),
    [categories, focalSlug, pages, scope],
  )
  const scopeLabel = scope === 'local' && focalPage ? `Local · ${focalPage.title}` : 'Global scope'

  const toggleCategory = (category: Category) => {
    setCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const toolbar = focalSlug ? (
    <div className={styles.scopeToggle} aria-label="Graph scope">
      <button type="button" aria-pressed={scope === 'global'} onClick={() => setScope('global')}>Global</button>
      <button type="button" aria-pressed={scope === 'local'} onClick={() => setScope('local')}>Local</button>
    </div>
  ) : undefined

  return (
    <DockableWindow
      title="Relationship graph"
      subtitle={`${world.name} · ${scopeLabel} · ${graph.nodes.length} Pages`}
      initialState={focalSlug ? 'floating' : 'fullscreen'}
      onClose={onClose}
      toolbar={toolbar}
      icon={<icons.graph />}
      accent="var(--bronze)"
    >
      <div className={styles.panel}>
        <div className={styles.categories} aria-label="Filter graph by Category">
          {CATEGORY_META.map((meta) => {
            const active = categories.has(meta.category)
            const count = pages.filter((page) => page.category === meta.category).length
            return (
              <button
                key={meta.category}
                type="button"
                aria-pressed={active}
                aria-label={`${meta.label} (${count})`}
                onClick={() => toggleCategory(meta.category)}
              >
                <span style={{ color: `var(--cat-${meta.category})` }}><meta.icon size={12} /></span>{meta.label}<small>{count}</small>
              </button>
            )
          })}
        </div>
        <GraphCanvas graph={graph} onNavigate={onNavigatePage} />
        {graph.nodes.length === 0 && <p className={styles.empty}>No Pages match these Category filters.</p>}
        <footer className={styles.legend}>
          <span><i /> Wikilinks, Relations & Era membership</span>
          <span>Drag nodes · scroll to zoom · drag space to pan</span>
          {graph.nodes.length > 300 && <strong>Reduced physics detail for {graph.nodes.length} Pages</strong>}
        </footer>
      </div>
    </DockableWindow>
  )
}

interface GraphCanvasProps {
  graph: RelationshipGraph
  onNavigate: (slug: string) => void
}

interface ViewTransform { x: number; y: number; zoom: number }
interface NodeDrag { slug: string; startX: number; startY: number; moved: boolean }
interface PanDrag { startX: number; startY: number; originX: number; originY: number }

const WIDTH = 1200
const HEIGHT = 760
// Freshly revealed nodes start at this scale and grow toward 1 as their links land.
const NODE_BASE_SCALE = 0.45
const clampZoom = (zoom: number) => Math.max(0.4, Math.min(2.6, zoom))

/**
 * SVG renderer whose animation loop only mutates element refs. React renders
 * immutable graph frames (data/filter changes), never physics frames.
 */
export function GraphCanvas({ graph, onNavigate }: GraphCanvasProps) {
  const nodeRefs = useRef(new Map<string, SVGGElement>())
  const edgeRefs = useRef(new Map<string, SVGLineElement>())
  const stageRef = useRef<SVGGElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<ForceSimulation | undefined>(undefined)
  const frameRef = useRef<number | undefined>(undefined)
  const runRef = useRef<() => void>(() => {})
  const transformRef = useRef<ViewTransform>({ x: 0, y: 0, zoom: 1 })
  const nodeDragRef = useRef<NodeDrag | undefined>(undefined)
  const panDragRef = useRef<PanDrag | undefined>(undefined)
  const suppressClickRef = useRef<string | undefined>(undefined)
  const pointerCleanupRef = useRef<() => void>(() => {})
  const motionScale = useUiStore((state) => state.motionScale)

  const applyTransform = () => {
    const { x, y, zoom } = transformRef.current
    stageRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${zoom})`)
  }

  const writePositions = () => {
    const simulation = simulationRef.current
    if (!simulation) return
    for (const position of simulation.positions()) {
      nodeRefs.current.get(position.slug)?.setAttribute('transform', `translate(${position.x} ${position.y})`)
    }
    for (const edge of graph.edges) {
      const source = simulation.position(edge.sourceSlug)
      const target = simulation.position(edge.targetSlug)
      const line = edgeRefs.current.get(edge.key)
      if (!source || !target || !line) continue
      line.setAttribute('x1', `${source.x}`)
      line.setAttribute('y1', `${source.y}`)
      line.setAttribute('x2', `${target.x}`)
      line.setAttribute('y2', `${target.y}`)
    }
  }

  useLayoutEffect(() => {
    cancelAnimationFrame(frameRef.current ?? 0)
    const simulation = createForceSimulation(graph, {
      width: WIDTH,
      height: HEIGHT,
      scope: graph.focalSlug ? 'local' : 'global',
    })
    simulationRef.current = simulation
    const reduced = prefersReducedMotion()
    // PRD #16 intentionally normalizes the prototype's inverted 170/mo
    // cadence to the app-wide multiply-is-slower motionScale contract.
    const revealStep = reduced || graph.nodes.length > 300 ? 0 : 170 * motionScale
    const startedAt = performance.now()
    let settledFrames = 0
    let stopped = false

    writePositions()
    applyTransform()

    // Full link count per node in the current (possibly filtered) graph, so a
    // node reaches full size once all of its visible links have landed.
    const linkCount = new Map<string, number>()
    for (const edge of graph.edges) {
      linkCount.set(edge.sourceSlug, (linkCount.get(edge.sourceSlug) ?? 0) + 1)
      linkCount.set(edge.targetSlug, (linkCount.get(edge.targetSlug) ?? 0) + 1)
    }

    const run = () => {
      if (stopped) return
      const now = performance.now()
      const visibleCount = revealStep === 0 ? graph.nodes.length : Math.min(graph.nodes.length, Math.floor((now - startedAt) / revealStep) + 1)
      const positions = simulation.positions()
      const revealed = new Set<string>()
      for (let index = 0; index < positions.length; index += 1) {
        const slug = positions[index].slug
        const isRevealed = index < visibleCount
        if (isRevealed) revealed.add(slug)
        const element = nodeRefs.current.get(slug)
        if (!element) continue
        element.dataset.revealed = isRevealed ? 'true' : 'false'
        element.tabIndex = isRevealed ? 0 : -1
      }
      // A link only completes once both of its endpoints have appeared; each
      // completed link nudges its endpoint nodes a little larger.
      const landed = new Map<string, number>()
      for (const edge of graph.edges) {
        const complete = revealed.has(edge.sourceSlug) && revealed.has(edge.targetSlug)
        const line = edgeRefs.current.get(edge.key)
        if (line) line.dataset.revealed = complete ? 'true' : 'false'
        if (!complete) continue
        landed.set(edge.sourceSlug, (landed.get(edge.sourceSlug) ?? 0) + 1)
        landed.set(edge.targetSlug, (landed.get(edge.targetSlug) ?? 0) + 1)
      }
      for (const slug of revealed) {
        const element = nodeRefs.current.get(slug)
        if (!element) continue
        const total = linkCount.get(slug) ?? 0
        const grown = total === 0 ? 1 : (landed.get(slug) ?? 0) / total
        element.style.setProperty('--node-scale', (NODE_BASE_SCALE + (1 - NODE_BASE_SCALE) * grown).toFixed(3))
      }
      const frame = simulation.tick(visibleCount)
      writePositions()
      const revealDone = visibleCount >= graph.nodes.length
      settledFrames = revealDone && frame.kineticEnergy < 0.4 && !simulation.isDragging() ? settledFrames + 1 : 0
      if (settledFrames < 3) frameRef.current = requestAnimationFrame(run)
      else stopped = true
    }
    runRef.current = () => {
      if (!stopped && frameRef.current !== undefined) return
      stopped = false
      settledFrames = 0
      frameRef.current = requestAnimationFrame(run)
    }
    frameRef.current = requestAnimationFrame(run)
    return () => {
      stopped = true
      cancelAnimationFrame(frameRef.current ?? 0)
      simulationRef.current = undefined
    }
  }, [graph, motionScale])

  useEffect(() => () => pointerCleanupRef.current(), [])

  const trackPointer = (move: (event: PointerEvent) => void, up: () => void) => {
    pointerCleanupRef.current()
    const finish = () => {
      pointerCleanupRef.current()
      up()
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', finish, { once: true })
    pointerCleanupRef.current = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', finish)
      pointerCleanupRef.current = () => {}
    }
  }

  const clientPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return { x: clientX, y: clientY }
    return {
      x: ((clientX - rect.left) / rect.width) * WIDTH,
      y: ((clientY - rect.top) / rect.height) * HEIGHT,
    }
  }

  const graphPoint = (clientX: number, clientY: number) => {
    const { x, y, zoom } = transformRef.current
    const point = clientPoint(clientX, clientY)
    return { x: (point.x - x) / zoom, y: (point.y - y) / zoom }
  }

  const beginNodeDrag = (slug: string, event: ReactPointerEvent<SVGGElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    nodeDragRef.current = { slug, startX: event.clientX, startY: event.clientY, moved: false }
    simulationRef.current?.beginDrag(slug)
    trackPointer((moveEvent) => {
      const drag = nodeDragRef.current
      if (!drag) return
      if (Math.hypot(moveEvent.clientX - drag.startX, moveEvent.clientY - drag.startY) > 3) drag.moved = true
      const point = graphPoint(moveEvent.clientX, moveEvent.clientY)
      simulationRef.current?.dragTo(point.x, point.y)
      writePositions()
      runRef.current()
    }, () => {
      const drag = nodeDragRef.current
      if (drag?.moved) suppressClickRef.current = drag.slug
      nodeDragRef.current = undefined
      simulationRef.current?.endDrag()
      runRef.current()
    })
  }

  const beginPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return
    const current = transformRef.current
    const start = clientPoint(event.clientX, event.clientY)
    panDragRef.current = { startX: start.x, startY: start.y, originX: current.x, originY: current.y }
    trackPointer((moveEvent) => {
      const drag = panDragRef.current
      if (!drag) return
      const point = clientPoint(moveEvent.clientX, moveEvent.clientY)
      transformRef.current = {
        ...transformRef.current,
        x: drag.originX + point.x - drag.startX,
        y: drag.originY + point.y - drag.startY,
      }
      applyTransform()
    }, () => {
      panDragRef.current = undefined
    })
  }

  const zoomBy = (factor: number) => {
    transformRef.current = { ...transformRef.current, zoom: clampZoom(transformRef.current.zoom * factor) }
    applyTransform()
  }
  const onWheel = (event: ReactWheelEvent) => {
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 1.1 : 0.9)
  }

  const hover = (slug?: string) => {
    const neighbors = new Set<string>([slug ?? ''])
    for (const edge of graph.edges) {
      if (edge.sourceSlug === slug) neighbors.add(edge.targetSlug)
      if (edge.targetSlug === slug) neighbors.add(edge.sourceSlug)
      const edgeElement = edgeRefs.current.get(edge.key)
      if (edgeElement && slug && edge.sourceSlug !== slug && edge.targetSlug !== slug) edgeElement.dataset.dimmed = 'true'
      else if (edgeElement) delete edgeElement.dataset.dimmed
    }
    for (const [nodeSlug, element] of nodeRefs.current) {
      if (slug && !neighbors.has(nodeSlug)) element.dataset.dimmed = 'true'
      else delete element.dataset.dimmed
    }
  }

  return (
    <div className={styles.canvasWrap} data-large={graph.nodes.length > 300 || undefined}>
      <div className={styles.zoomControls}>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.18)}><icons.zoomIn size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.18)}><icons.zoomOut size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Reset graph view" onClick={() => { transformRef.current = { x: 0, y: 0, zoom: 1 }; applyTransform() }}><icons.resetView size={16} aria-hidden="true" /></button>
      </div>
      <svg ref={svgRef} className={styles.canvas} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} onPointerDown={beginPan} onWheel={onWheel}>
        <g ref={stageRef} data-testid="graph-stage">
          <g className={styles.edges}>
            {graph.edges.map((edge) => (
              <line
                key={edge.key}
                ref={(element) => { if (element) edgeRefs.current.set(edge.key, element); else edgeRefs.current.delete(edge.key) }}
                data-edge={edge.key}
              />
            ))}
          </g>
          <g className={styles.nodes}>
            {graph.nodes.map((node) => {
              const radius = Math.min(18, 7 + Math.sqrt(node.degree) * 2.2)
              return (
                <g
                  key={node.slug}
                  ref={(element) => { if (element) nodeRefs.current.set(node.slug, element); else nodeRefs.current.delete(node.slug) }}
                  role="button"
                  tabIndex={-1}
                  aria-label={node.title}
                  data-testid={`graph-node-${node.slug}`}
                  data-node={node.slug}
                  data-category={node.category}
                  data-focal={node.slug === graph.focalSlug ? 'true' : undefined}
                  className={styles.node}
                  onPointerDown={(event) => beginNodeDrag(node.slug, event)}
                  onMouseEnter={() => hover(node.slug)}
                  onMouseLeave={() => hover()}
                  onClick={() => {
                    if (suppressClickRef.current === node.slug) {
                      suppressClickRef.current = undefined
                      return
                    }
                    onNavigate(node.slug)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    onNavigate(node.slug)
                  }}
                >
                  <circle className={styles.nodeHalo} r={radius + 7} />
                  <circle className={styles.nodeCore} r={radius} style={{ '--node-color': `var(--cat-${node.category})` } as CSSProperties} />
                  <text y={radius + 18} textAnchor="middle">{node.title}</text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
    </div>
  )
}
