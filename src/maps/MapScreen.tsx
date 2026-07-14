import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Page, World } from '../domain/types'
import { getRepository } from '../state/repository'
import { categoryMeta } from '../screens/Dashboard/categoryMeta'
import { eraDateLabel } from '../domain/timeline'
import { buildMapBreadcrumbs, clampMapPan, isPinVisible, pinsForPage, resolveMapImage } from './mapDomain'
import styles from './MapScreen.module.css'

type LoadState = 'loading' | 'ready' | 'missing' | 'error'
interface Pan { x: number; y: number }
interface DragStart { pointerX: number; pointerY: number; pan: Pan }
interface MapPositionPercent { x: number; y: number }
interface MapTransition { mapTransition?: 'in' | 'out'; origin?: MapPositionPercent }
interface MapImageState { mapId: string; activeEra: string; image?: string }

const MIN_ZOOM = 0.6
const MAX_ZOOM = 3.4
const ZOOM_STEP = 0.2

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10))
}

function readerParagraphs(body: string): string[] {
  return body
    .replace(/:::callout[^\n]*\n|:::/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 4)
}

/** Read-only Map view backed exclusively by World/Page Markdown through the repository seam. */
export function MapScreen() {
  const { world: worldSlug = '', mapId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const repository = getRepository()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [world, setWorld] = useState<World>()
  const [pages, setPages] = useState<Page[]>([])
  const [selectedPinId, setSelectedPinId] = useState<string>()
  const [resolvedMapId, setResolvedMapId] = useState<string>()
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState<DragStart>()
  const [readerOpen, setReaderOpen] = useState(false)
  const [fadingFromImage, setFadingFromImage] = useState<string>()
  const [completedTransitionKey, setCompletedTransitionKey] = useState<string>()
  const dragRef = useRef<DragStart | undefined>(undefined)
  const viewportRef = useRef<HTMLDivElement>(null)
  const lastImageRef = useRef<MapImageState | undefined>(undefined)
  const deepLinkedPage = new URLSearchParams(location.search).get('page') ?? undefined

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    Promise.all([repository.getWorld(worldSlug), repository.listPages(worldSlug)])
      .then(([loadedWorld, loadedPages]) => {
        if (cancelled) return
        if (!loadedWorld) {
          setLoadState('missing')
          return
        }
        const page = deepLinkedPage ? loadedPages.find((candidate) => candidate.slug === deepLinkedPage) : undefined
        const pagePins = page ? pinsForPage(loadedWorld.pins, page.slug) : []
        const preferredPin = pagePins.find((pin) => isPinVisible(pin, page!, loadedWorld.activeEra, loadedWorld.eraOrder)) ?? pagePins[0]
        const nextMapId = mapId ?? preferredPin?.mapId ?? loadedWorld.rootMap
        const nextMap = loadedWorld.maps.find((candidate) => candidate.id === nextMapId)
        if (!nextMap) {
          setWorld(loadedWorld)
          setPages(loadedPages)
          setLoadState('missing')
          return
        }
        if (cancelled) return
        setWorld(loadedWorld)
        setPages(loadedPages)
        setResolvedMapId(nextMap.id)
        setSelectedPinId(preferredPin?.id)
        setZoom(1)
        setPan({ x: 0, y: 0 })
        setReaderOpen(false)
        setLoadState('ready')
      })
      .catch(() => !cancelled && setLoadState('error'))
    return () => { cancelled = true }
  }, [deepLinkedPage, mapId, repository, worldSlug])

  useEffect(() => {
    if (!dragStart) return
    const move = (event: PointerEvent) => {
      const start = dragRef.current
      if (!start) return
      const rect = viewportRef.current?.getBoundingClientRect()
      setPan(clampMapPan(
        { x: start.pan.x + event.clientX - start.pointerX, y: start.pan.y + event.clientY - start.pointerY },
        zoom,
        { width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight },
      ))
    }
    const end = () => {
      dragRef.current = undefined
      setDragStart(undefined)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end, { once: true })
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
    }
  }, [dragStart, zoom])

  const pageBySlug = useMemo(() => new Map(pages.map((page) => [page.slug, page])), [pages])
  const currentMap = world?.maps.find((candidate) => candidate.id === resolvedMapId)
  const selectedPin = world?.pins.find((pin) => pin.id === selectedPinId && pin.mapId === currentMap?.id)
  const selectedPage = selectedPin ? pageBySlug.get(selectedPin.pageSlug) : undefined
  const selectedPinIsVisible = world && selectedPin && selectedPage
    ? isPinVisible(selectedPin, selectedPage, world.activeEra, world.eraOrder)
    : false
  const selectedPageMapCount = world && selectedPage
    ? new Set(world.pins.filter((pin) => pin.pageSlug === selectedPage.slug).map((pin) => pin.mapId)).size
    : 0
  const eraPages = world?.eraOrder.map((slug) => pageBySlug.get(slug)).filter((page): page is Page => page !== undefined) ?? []
  const breadcrumbs = world && currentMap ? buildMapBreadcrumbs(world.maps, currentMap.id) : []
  const image = world && currentMap ? resolveMapImage(currentMap, world.activeEra, world.eraOrder) : undefined
  const requestedTransition = location.state as MapTransition | null
  const transition = completedTransitionKey === location.key ? undefined : requestedTransition?.mapTransition
  const transitionOrigin = transition ? requestedTransition?.origin : undefined

  useEffect(() => {
    if (!currentMap || !world) return
    const next = { mapId: currentMap.id, activeEra: world.activeEra, image }
    const previous = lastImageRef.current
    lastImageRef.current = next
    if (!previous || previous.mapId !== next.mapId || previous.activeEra === next.activeEra || previous.image === next.image) {
      setFadingFromImage(undefined)
      return
    }
    setFadingFromImage(previous.image)
    if (!previous.image) return
    const timer = window.setTimeout(() => setFadingFromImage((current) => current === previous.image ? undefined : current), 480)
    return () => window.clearTimeout(timer)
  }, [currentMap, image, world])

  useEffect(() => {
    if (!transition) return
    const timer = window.setTimeout(() => setCompletedTransitionKey(location.key), 500)
    return () => window.clearTimeout(timer)
  }, [location.key, transition])

  if (loadState !== 'ready' || !world || !currentMap) {
    return (
      <main className={styles.state}>
        <span>LandForger Maps</span>
        <h1>{loadState === 'missing' ? 'Map not found' : loadState === 'error' ? "This Map couldn't be loaded." : 'Unrolling the chart…'}</h1>
        <Link to={`/w/${worldSlug}`}>Back to World</Link>
      </main>
    )
  }

  const visiblePins = world.pins.filter((pin) => {
    if (pin.mapId !== currentMap.id) return false
    const page = pageBySlug.get(pin.pageSlug)
    return page ? isPinVisible(pin, page, world.activeEra, world.eraOrder) : false
  })

  const setActiveEra = async (eraSlug: string) => {
    if (eraSlug === world.activeEra) return
    setSelectedPinId(undefined)
    setReaderOpen(false)
    setWorld((current) => current ? { ...current, activeEra: eraSlug } : current)
    try {
      setWorld(await repository.updateWorld(world.slug, { activeEra: eraSlug }))
    } catch {
      setWorld(world)
    }
  }

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a')) return
    const start = { pointerX: event.clientX, pointerY: event.clientY, pan }
    dragRef.current = start
    setDragStart(start)
  }

  const panWithinViewport = (next: Pan, scale = zoom): Pan => {
    const rect = viewportRef.current?.getBoundingClientRect()
    return clampMapPan(next, scale, { width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight })
  }

  const changeZoom = (delta: number) => {
    setZoom((current) => {
      const next = clampZoom(current + delta)
      setPan((position) => panWithinViewport(position, next))
      return next
    })
  }

  const wheelZoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    changeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
  }

  const navigateMap = (targetId: string, direction: 'in' | 'out', origin: MapPositionPercent) => {
    navigate(`/w/${world.slug}/map/${targetId}`, { state: { mapTransition: direction, origin } satisfies MapTransition })
  }

  const breadcrumbOrigin = (targetIndex: number) => {
    const firstDescendant = breadcrumbs[targetIndex + 1]
    const originPin = firstDescendant?.parentPin ? world.pins.find((pin) => pin.id === firstDescendant.parentPin) : undefined
    return originPin ? { x: originPin.x, y: originPin.y } : { x: 50, y: 50 }
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link className={styles.back} to={`/w/${world.slug}`}>‹ {world.name}</Link>
        <nav className={styles.breadcrumbs} aria-label="Map breadcrumbs">
          {breadcrumbs.map((crumb, index) => index === breadcrumbs.length - 1 ? (
            <span key={crumb.id}>{crumb.title}</span>
          ) : (
            <span key={crumb.id}>
              <Link
                to={`/w/${world.slug}/map/${crumb.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  navigateMap(crumb.id, 'out', breadcrumbOrigin(index))
                }}
              >{crumb.title}</Link><i>/</i>
            </span>
          ))}
        </nav>
        <div className={styles.titleBlock}><span>Viewing map</span><h1>{currentMap.title}</h1></div>
        <div className={styles.zoomControls} aria-label="Map zoom controls">
          <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-ZOOM_STEP)}>−</button>
          <button type="button" aria-label="Reset map view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => changeZoom(ZOOM_STEP)}>＋</button>
        </div>
      </header>

      <div className={styles.mapArea}>
        <div
          ref={viewportRef}
          className={styles.viewport}
          data-dragging={dragStart ? 'true' : undefined}
          onPointerDown={startPan}
          onWheel={wheelZoom}
        >
          <div
            className={styles.stage}
            data-testid="map-stage"
            data-zoom={zoom}
            data-transition={transition}
            onAnimationEnd={(event) => {
              if (event.currentTarget === event.target && transition) setCompletedTransitionKey(location.key)
            }}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: transitionOrigin ? `${transitionOrigin.x}% ${transitionOrigin.y}%` : '50% 50%',
            }}
          >
            {fadingFromImage && <img className={styles.previousMapImage} src={fadingFromImage} alt="" />}
            {image ? <img key={image} className={styles.mapImage} src={image} alt={`Map of ${currentMap.title}`} /> : <div className={styles.noImage}>No chart survives from this Era.</div>}
            {visiblePins.map((pin) => {
              const page = pageBySlug.get(pin.pageSlug)!
              const meta = categoryMeta(page.category)
              const selected = pin.id === selectedPinId
              return (
                <button
                  type="button"
                  key={pin.id}
                  className={styles.pin}
                  aria-label={page.title}
                  aria-pressed={selected}
                  data-selected={selected || undefined}
                  data-child={pin.childMap ? 'true' : undefined}
                  style={{
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    '--pin-color': `var(--cat-${page.category})`,
                    '--pin-scale': 1 / zoom,
                  } as CSSProperties}
                  onClick={() => { setSelectedPinId(pin.id); setReaderOpen(false) }}
                >
                  <i><em>{meta?.icon ?? '◆'}</em></i>
                  <span>{page.title}</span>
                  {pin.childMap && <b aria-hidden="true">⌄</b>}
                </button>
              )
            })}
          </div>
        </div>

        {selectedPin && selectedPage && (
          <aside className={styles.inspector} aria-label="Pin inspector">
            <button type="button" className={styles.closeInspector} aria-label="Close Pin inspector" onClick={() => { setSelectedPinId(undefined); setReaderOpen(false) }}>×</button>
            {selectedPage.cover ? (
              <img src={selectedPage.cover} alt="" />
            ) : (
              <div className={styles.coverFallback} style={{ color: `var(--cat-${selectedPage.category})` }}>{categoryMeta(selectedPage.category)?.icon ?? '◆'}</div>
            )}
            <span className={styles.eyebrow} style={{ color: `var(--cat-${selectedPage.category})` }}>{categoryMeta(selectedPage.category)?.label}</span>
            <h2>{selectedPage.title}</h2>
            <p>{selectedPage.summary}</p>
            <small className={styles.pinCount}>Pinned on {selectedPageMapCount} {selectedPageMapCount === 1 ? 'map' : 'maps'}</small>
            {!selectedPinIsVisible && <p className={styles.filteredNotice}>This Pin is hidden in the Active Era.</p>}
            <section className={styles.membership} aria-label="Era membership">
              <h3>Visible in</h3>
              {eraPages.map((era) => {
                const included = isPinVisible(selectedPin, selectedPage, era.slug, world.eraOrder)
                return <span key={era.slug} data-included={included || undefined}><i />{era.title}</span>
              })}
              {selectedPage.eras.length === 0 && <small>Timeless · visible in every Era</small>}
            </section>
            <div className={styles.inspectorActions}>
              <Link to={`/w/${world.slug}/p/${selectedPage.slug}`}>Open full page</Link>
              <button type="button" onClick={() => setReaderOpen((open) => !open)}>{readerOpen ? 'Close reader' : 'Read in dock'}</button>
              {selectedPin.childMap && (
                <button type="button" onClick={() => navigateMap(selectedPin.childMap!, 'in', { x: selectedPin.x, y: selectedPin.y })}>
                  Enter {world.maps.find((map) => map.id === selectedPin.childMap)?.title ?? 'child'} map
                </button>
              )}
            </div>
          </aside>
        )}

        {readerOpen && selectedPage && (
          <aside className={styles.reader} aria-label="Docked reader">
            <header><span>Docked reader</span><button type="button" aria-label="Close reader" onClick={() => setReaderOpen(false)}>×</button></header>
            <h2>{selectedPage.title}</h2>
            {readerParagraphs(selectedPage.body).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <Link to={`/w/${world.slug}/p/${selectedPage.slug}`}>Continue on full page →</Link>
          </aside>
        )}
      </div>

      <section className={styles.eraDock} aria-label="Active Era">
        <header><span>Active Era</span><strong>{eraPages.find((era) => era.slug === world.activeEra)?.title ?? 'No Active Era'}</strong></header>
        <div className={styles.eraRail}>
          {eraPages.map((era, index) => {
            const active = era.slug === world.activeEra
            return (
              <button
                type="button"
                key={era.slug}
                aria-label={`${era.title} · ${eraDateLabel(era)}`}
                aria-pressed={active}
                onClick={() => void setActiveEra(era.slug)}
              >
                <i data-past={index <= world.eraOrder.indexOf(world.activeEra) || undefined} />
                <span><strong>{era.title}</strong><small>{eraDateLabel(era)}</small></span>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}
