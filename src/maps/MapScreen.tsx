import type { ChangeEvent, CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CATEGORIES, type Page, type Pin, type World } from '../domain/types'
import { getRepository } from '../state/repository'
import { icons } from '../icons'
import { categoryMeta } from '../screens/Dashboard/categoryMeta'
import { eraDateLabel } from '../domain/timeline'
import {
  buildMapBreadcrumbs,
  clampMapPan,
  clampPinPosition,
  createChildMap,
  createPin,
  isPinVisible,
  narrowPinEras,
  pinsForPage,
  resolveMapImage,
  type MapCollectionState,
} from './mapDomain'
import { persistMapCollection } from './mapPersistence'
import { overlayExitTransition, prefersReducedMotion } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import styles from './MapScreen.module.css'

type LoadState = 'loading' | 'ready' | 'missing' | 'error'
interface Pan { x: number; y: number }
interface DragStart { pointerX: number; pointerY: number; pan: Pan }
interface MapPositionPercent { x: number; y: number }
interface MapTransition { mapTransition?: 'in' | 'out'; origin?: MapPositionPercent }
interface MapImageState { mapId: string; activeEra: string; image?: string }
interface PinDrag { pinId: string; originalPins: Pin[]; element: HTMLButtonElement }

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

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read'))
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read'))
    reader.readAsDataURL(file)
  })
}

/** Map viewer/editor backed exclusively by World/Page Markdown through the repository seam. */
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
  const [zooming, setZooming] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const [fadingFromImage, setFadingFromImage] = useState<string>()
  const [completedTransitionKey, setCompletedTransitionKey] = useState<string>()
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pageQuery, setPageQuery] = useState('')
  const [placingPageSlug, setPlacingPageSlug] = useState<string>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pinDrag, setPinDrag] = useState<PinDrag>()
  const motionScale = useUiStore((state) => state.motionScale)
  const dragRef = useRef<DragStart | undefined>(undefined)
  const livePanRef = useRef<Pan | undefined>(undefined)
  const livePinPositionRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<World | undefined>(undefined)
  const lastImageRef = useRef<MapImageState | undefined>(undefined)
  const deepLinkedPage = new URLSearchParams(location.search).get('page') ?? undefined
  worldRef.current = world

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
        setZooming(false)
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
      const next = clampMapPan(
        { x: start.pan.x + event.clientX - start.pointerX, y: start.pan.y + event.clientY - start.pointerY },
        zoom,
        { width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight },
      )
      livePanRef.current = next
      if (stageRef.current) stageRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${zoom})`
    }
    const end = () => {
      if (livePanRef.current) setPan(livePanRef.current)
      livePanRef.current = undefined
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

  useEffect(() => {
    if (!pinDrag) return
    const move = (event: PointerEvent) => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect?.width || !rect.height) return
      const position = clampPinPosition({
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      })
      livePinPositionRef.current = position
      pinDrag.element.style.left = `${position.x}%`
      pinDrag.element.style.top = `${position.y}%`
    }
    const end = () => {
      const position = livePinPositionRef.current
      livePinPositionRef.current = undefined
      setPinDrag(undefined)
      const latest = worldRef.current
      if (!latest || !position) return
      const pins = latest.pins.map((pin) => pin.id === pinDrag.pinId ? { ...pin, ...position } : pin)
      setWorld({ ...latest, pins })
      void repository.updateWorld(latest.slug, { pins })
        .then(setWorld)
        .catch(() => setWorld((current) => current ? { ...current, pins: pinDrag.originalPins } : current))
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end, { once: true })
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
    }
  }, [pinDrag, repository])

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
    if (!previous || previous.mapId !== next.mapId || previous.image === next.image) {
      setFadingFromImage(undefined)
      return
    }
    setFadingFromImage(previous.image)
    if (!previous.image) return
    const timer = window.setTimeout(
      () => setFadingFromImage((current) => current === previous.image ? undefined : current),
      prefersReducedMotion() ? 0 : 560 * motionScale + 40,
    )
    return () => window.clearTimeout(timer)
  }, [currentMap, image, motionScale, world])

  useEffect(() => {
    if (!transition) return
    const timer = window.setTimeout(
      () => setCompletedTransitionKey(location.key),
      prefersReducedMotion() ? 0 : 600 * motionScale,
    )
    return () => window.clearTimeout(timer)
  }, [location.key, motionScale, transition])


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
  const renderedPins = editing
    ? world.pins.filter((pin) => pin.mapId === currentMap.id && pageBySlug.has(pin.pageSlug))
    : visiblePins
  const placingPage = placingPageSlug ? pageBySlug.get(placingPageSlug) : undefined
  const pickerPages = pages.filter((page) => {
    const query = pageQuery.trim().toLocaleLowerCase()
    return !query || page.title.toLocaleLowerCase().includes(query) || page.slug.includes(query)
  })

  const persistMapState = (state: MapCollectionState) => persistMapCollection(repository, world, state, setWorld)

  const placePage = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!placingPage || (event.target as HTMLElement).closest('button')) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const placed = createPin(world.pins, currentMap.id, placingPage, {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    })
    setPlacingPageSlug(undefined)
    setSelectedPinId(placed.id)
    void persistMapState({ ...world, pins: [...world.pins, placed] })
  }

  const updatePinEras = (pin: Pin, page: Page, eraSlug: string) => {
    const requested = pin.eras.includes(eraSlug)
      ? pin.eras.filter((candidate) => candidate !== eraSlug)
      : [...pin.eras, eraSlug]
    const updatedPin = narrowPinEras(pin, page, requested, world.eraOrder)
    if (updatedPin === pin) return
    void persistMapState({ ...world, pins: world.pins.map((candidate) => candidate.id === pin.id ? updatedPin : candidate) })
  }

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>, imageKey: string) => {
    const file = event.target.files?.[0]
    if (!file) return
    const dataUrl = await fileAsDataUrl(file)
    const maps = world.maps.map((map) => map.id === currentMap.id
      ? { ...map, images: { ...map.images, [imageKey]: dataUrl } }
      : map)
    await persistMapState({ ...world, maps })
  }

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
    // Compositor layer promotion (will-change) is released once the settling
    // transition finishes — see the stage's onTransitionEnd below (#62).
    setZooming(true)
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
        <Link className={styles.back} to={`/w/${world.slug}`}><icons.caretLeft size={14} /> {world.name}</Link>
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
        <div className={styles.titleBlock}><span>{editing ? 'Editing layout' : 'Viewing map'}</span><h1>{currentMap.title}</h1></div>
        <div className={styles.mapActions}>
          <button type="button" aria-pressed={editing} onClick={() => { setEditing((value) => !value); setPlacingPageSlug(undefined) }}>Edit layout</button>
          <button type="button" onClick={() => { setPickerOpen(true); setPageQuery('') }}>Add Pin</button>
          <Link to={`/w/${world.slug}/library`}>Map Library</Link>
          <button type="button" aria-label="Map settings" onClick={() => setSettingsOpen((open) => !open)}><icons.settings size={16} /></button>
        </div>
        <div className={styles.zoomControls} aria-label="Map zoom controls">
          <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-ZOOM_STEP)}><icons.minus size={14} /></button>
          <button type="button" aria-label="Reset map view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => changeZoom(ZOOM_STEP)}><icons.add size={14} /></button>
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
            ref={stageRef}
            className={styles.stage}
            data-testid="map-stage"
            data-zoom={zoom}
            data-transition={transition}
            data-active={(Boolean(dragStart) || zooming) || undefined}
            onAnimationEnd={(event) => {
              if (event.currentTarget === event.target && transition) setCompletedTransitionKey(location.key)
            }}
            onTransitionEnd={(event) => {
              // Pan/zoom settled: release the promoted compositor layer (#62).
              // `.stage` only transitions `transform`, so no propertyName filter is needed.
              if (event.currentTarget === event.target) setZooming(false)
            }}
            onClick={placePage}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: transitionOrigin ? `${transitionOrigin.x}% ${transitionOrigin.y}%` : '50% 50%',
            }}
          >
            {fadingFromImage && <img className={styles.previousMapImage} src={fadingFromImage} alt="" />}
            {image ? <img key={image} className={styles.mapImage} src={image} alt={`Map of ${currentMap.title}`} /> : <div className={styles.noImage}>No chart survives from this Era.</div>}
            {renderedPins.map((pin) => {
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
                  data-editing={editing || undefined}
                  style={{
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    '--pin-color': `var(--cat-${page.category})`,
                    '--pin-scale': 1 / zoom,
                  } as CSSProperties}
                  onPointerDown={(event) => {
                    if (!editing || event.button !== 0) return
                    event.preventDefault()
                    event.stopPropagation()
                    setPinDrag({ pinId: pin.id, originalPins: world.pins, element: event.currentTarget })
                  }}
                  onClick={(event) => { event.stopPropagation(); setSelectedPinId(pin.id); setReaderOpen(false) }}
                >
                  <i><em>{meta ? <meta.icon size={14} /> : <icons.marker size={14} />}</em></i>
                  <span>{page.title}</span>
                  {pin.childMap && <b aria-hidden="true"><icons.caretDown size={12} /></b>}
                </button>
              )
            })}
          </div>
        </div>

        <AnimatePresence>
        {selectedPin && selectedPage && (
          <motion.aside className={styles.inspector} aria-label="Pin inspector" initial={{ opacity: 1 }} exit={{ opacity: 0, x: 12 }} transition={overlayExitTransition(motionScale)}>
            <button type="button" className={styles.closeInspector} aria-label="Close Pin inspector" onClick={() => { setSelectedPinId(undefined); setReaderOpen(false) }}><icons.close /></button>
            {selectedPage.cover ? (
              <img src={selectedPage.cover} alt="" />
            ) : (
              <div className={styles.coverFallback} style={{ color: `var(--cat-${selectedPage.category})` }}>
                {(() => { const CoverIcon = categoryMeta(selectedPage.category)?.icon ?? icons.marker; return <CoverIcon size={32} /> })()}
              </div>
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
                return editing && selectedPage.eras.length > 0 ? (
                  <label key={era.slug} data-included={included || undefined}>
                    <input
                      type="checkbox"
                      checked={selectedPin.eras.includes(era.slug)}
                      disabled={!selectedPage.eras.includes(era.slug)}
                      onChange={() => updatePinEras(selectedPin, selectedPage, era.slug)}
                    />
                    <i />{era.title}
                  </label>
                ) : <span key={era.slug} data-included={included || undefined}><i />{era.title}</span>
              })}
              {selectedPage.eras.length === 0 && <small>Timeless · visible in every Era</small>}
            </section>
            <div className={styles.inspectorActions}>
              <Link to={`/w/${world.slug}/p/${selectedPage.slug}`} viewTransition>Open full page</Link>
              <button type="button" onClick={() => setReaderOpen((open) => !open)}>{readerOpen ? 'Close reader' : 'Read in dock'}</button>
              {selectedPin.childMap && (
                <button type="button" onClick={() => navigateMap(selectedPin.childMap!, 'in', { x: selectedPin.x, y: selectedPin.y })}>
                  Enter {world.maps.find((map) => map.id === selectedPin.childMap)?.title ?? 'child'} map
                </button>
              )}
              {!selectedPin.childMap && editing && (
                <button type="button" onClick={() => {
                  const next = createChildMap(world, selectedPin.id, selectedPage.title)
                  void persistMapState(next)
                }}>Create child Map</button>
              )}
              {editing && (
                <button type="button" className={styles.danger} onClick={() => {
                  setSelectedPinId(undefined)
                  void persistMapState({ ...world, pins: world.pins.filter((pin) => pin.id !== selectedPin.id) })
                }}>Remove placement</button>
              )}
            </div>
          </motion.aside>
        )}
        </AnimatePresence>

        <AnimatePresence>
        {readerOpen && selectedPage && (
          <motion.aside className={styles.reader} aria-label="Docked reader" initial={{ opacity: 1 }} exit={{ opacity: 0, x: 12 }} transition={overlayExitTransition(motionScale)}>
            <header><span>Docked reader</span><button type="button" aria-label="Close reader" onClick={() => setReaderOpen(false)}><icons.close /></button></header>
            <h2>{selectedPage.title}</h2>
            {readerParagraphs(selectedPage.body).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <Link to={`/w/${world.slug}/p/${selectedPage.slug}`} viewTransition>Continue on full page <icons.arrowRight size={14} /></Link>
          </motion.aside>
        )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
      {placingPage && (
        <motion.div className={styles.placingBanner} role="status" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
          Click the Map to place {placingPage.title}
          <button type="button" onClick={() => setPlacingPageSlug(undefined)}>Cancel</button>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {pickerOpen && (
        <motion.div className={styles.scrim} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPickerOpen(false)} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
          <motion.section className={styles.modal} role="dialog" aria-label="Add Pin" initial={false} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
            <header><h2>Add Pin</h2><button type="button" aria-label="Close Add Pin" onClick={() => setPickerOpen(false)}><icons.close /></button></header>
            <input type="search" aria-label="Search Pages" value={pageQuery} onChange={(event) => setPageQuery(event.target.value)} autoFocus />
            <div className={styles.pagePicker}>
              {CATEGORIES.map((category) => {
                const categoryPages = pickerPages.filter((page) => page.category === category)
                if (categoryPages.length === 0) return null
                const meta = categoryMeta(category)
                return (
                  <section key={category} className={styles.pickerGroup} aria-labelledby={`picker-${category}`}>
                    <h3 id={`picker-${category}`}>{meta && <meta.icon size={16} />} {meta?.label}</h3>
                    {categoryPages.map((page) => (
                      <button type="button" key={page.slug} onClick={() => { setPlacingPageSlug(page.slug); setPickerOpen(false); setEditing(true) }}>
                        Place {page.title}
                      </button>
                    ))}
                  </section>
                )
              })}
              {pickerPages.length === 0 && <p>No Pages match that search.</p>}
            </div>
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {settingsOpen && (
        <motion.section className={styles.settings} role="dialog" aria-label="Map settings" initial={{ opacity: 1 }} exit={{ opacity: 0, y: 7, scale: 0.98 }} transition={overlayExitTransition(motionScale)}>
          <header><h2>Map settings</h2><button type="button" aria-label="Close Map settings" onClick={() => setSettingsOpen(false)}><icons.close /></button></header>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={currentMap.eraLinked}
              onChange={() => {
                const maps = world.maps.map((map) => map.id === currentMap.id ? { ...map, eraLinked: !map.eraLinked } : map)
                void persistMapState({ ...world, maps })
              }}
            />
            Era-linked · one image per Era
          </label>
          <div className={styles.imageSlots}>
            {(currentMap.eraLinked ? eraPages.map((era) => ({ key: era.slug, label: era.title })) : [{ key: 'all', label: 'All Eras' }]).map((slot) => (
              <label key={slot.key}>
                <span>{slot.label}<small>{currentMap.images[slot.key] ? 'Image ready' : 'Missing image'}</small></span>
                <input type="file" accept="image/*" aria-label={`Upload image for ${slot.label}`} onChange={(event) => void uploadImage(event, slot.key)} />
              </label>
            ))}
          </div>
        </motion.section>
      )}
      </AnimatePresence>

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
