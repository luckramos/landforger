import type { ChangeEvent, CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CATEGORIES, type Category, type Page, type Pin, type World } from '../domain/types'
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
  createRootMap,
  isPinVisible,
  narrowPinEras,
  pinsForPage,
  renameMap,
  resolveMapImage,
  setMapChart,
  setMapEraLinked,
  type MapCollectionState,
} from './mapDomain'
import { persistMapCollection } from './mapPersistence'
import { MapSpotlight, type MapPinItem } from './MapSpotlight'
import { UserMenu } from '../components/UserMenu/UserMenu'
import { DockableWindow } from '../components/DockableWindow/DockableWindow'
import { PageEditor } from '../editor/PageEditor'
import { PageProperties } from '../properties/PageProperties'
import { MapChartEditor } from './MapChartEditor'
import { overlayExitTransition, prefersReducedMotion } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import { useDockStore } from '../state/dockStore'
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
const ERA_WINDOW = 4

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

/** The dossier blurb: the Page's own summary, or the opening of its body when
    the author never wrote one. Trimmed so the card stays a glance, not a read. */
function dossierBlurb(page: Page): string {
  const summary = page.summary?.trim()
  if (summary) return summary
  const opening = readerParagraphs(page.body)[0] ?? ''
  return opening.length > 240 ? `${opening.slice(0, 237).trimEnd()}…` : opening
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read'))
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read'))
    reader.readAsDataURL(file)
  })
}

/** Engraved compass rose for the uncharted empty state; decorative, its needle settles on load. */
function CompassRose() {
  return (
    <svg className={styles.compass} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle className={styles.compassRing} cx="50" cy="50" r="45" />
      <circle className={styles.compassRing} cx="50" cy="50" r="33" />
      <g className={styles.compassCard}>
        <polygon className={styles.compassStar} points="50,10 57,43 90,50 57,57 50,90 43,57 10,50 43,43" />
        <polygon className={styles.compassNeedle} points="50,12 45,47 55,47" />
        <circle className={styles.compassDot} cx="50" cy="50" r="2.6" />
      </g>
    </svg>
  )
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
  const [fadingFromImage, setFadingFromImage] = useState<string>()
  const [completedTransitionKey, setCompletedTransitionKey] = useState<string>()
  const [editing, setEditing] = useState(false)
  const readerOpen = useDockStore((state) => state.panels.reader.open)
  const openDock = useDockStore((state) => state.open)
  const closeDock = useDockStore((state) => state.close)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pageQuery, setPageQuery] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<Category>>(new Set())
  const [placingPageSlug, setPlacingPageSlug] = useState<string>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [pinDrag, setPinDrag] = useState<PinDrag>()
  const [creatingMap, setCreatingMap] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusedPinId, setFocusedPinId] = useState<string>()
  const [eraCollapsed, setEraCollapsed] = useState(false)
  const [eraWindow, setEraWindow] = useState(0)
  const motionScale = useUiStore((state) => state.motionScale)
  const dragRef = useRef<DragStart | undefined>(undefined)
  const livePanRef = useRef<Pan | undefined>(undefined)
  const livePinPositionRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const firstMapInputRef = useRef<HTMLInputElement>(null)
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
        closeDock('reader')
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
  // Relation Custom Properties, flattened to their target Slugs — rendered as
  // links in the dossier exactly as a Page renders its own relations.
  const selectedPageRelations = (selectedPage?.customProperties ?? [])
    .filter((property) => property.type === 'relation')
    .map((property) => ({
      key: property.key,
      label: property.label,
      slugs: (Array.isArray(property.value) ? property.value : [property.value]).filter((slug): slug is string => typeof slug === 'string' && slug.length > 0),
    }))
    .filter((relation) => relation.slugs.length > 0)
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // The focus highlight is a one-shot ring; clear the flag after it plays so the
  // Pin returns to its ordinary selected pulse.
  useEffect(() => {
    if (!focusedPinId) return
    const timer = window.setTimeout(() => setFocusedPinId(undefined), prefersReducedMotion() ? 0 : 1400 * motionScale)
    return () => window.clearTimeout(timer)
  }, [focusedPinId, motionScale])

  // The rail shows ERA_WINDOW Eras at a time; as the Active Era advances toward
  // the antepenultimate visible slot it drags the window along so at least one
  // Era ahead stays in view. Functional update no-ops when nothing shifts.
  useEffect(() => {
    if (!world) return
    const index = world.eraOrder.indexOf(world.activeEra)
    if (index < 0) return
    const maxStart = Math.max(0, world.eraOrder.length - ERA_WINDOW)
    setEraWindow((prev) => {
      let next = prev
      if (index > prev + ERA_WINDOW - 2) next = index - (ERA_WINDOW - 2)
      else if (index < prev + 1) next = index - 1
      return Math.min(maxStart, Math.max(0, next))
    })
  }, [world])


  // A World loaded fine but owns no Map yet: invite the first chart rather than
  // reporting a failure. A bad :mapId on a mapped World still falls through to
  // the generic state below as a true "not found".
  const chartFirstMap = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !world) return
    setCreatingMap(true)
    try {
      const dataUrl = await fileAsDataUrl(file)
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'World map'
      const next = createRootMap(world, title, dataUrl)
      await persistMapCollection(repository, world, next, setWorld)
      navigate(`/w/${world.slug}/map/${next.rootMap}`)
    } catch {
      setCreatingMap(false)
    }
  }

  if (loadState === 'missing' && world && world.maps.length === 0) {
    return (
      <main className={styles.uncharted}>
        <Link className={styles.back} to={`/w/${world.slug}`}><icons.caretLeft size={14} /> {world.name}</Link>
        <section className={styles.plate}>
          <div className={styles.chart}>
            <CompassRose />
            <span className={styles.eyebrow}>Uncharted</span>
            <h1>{world.name} has no map yet.</h1>
            <p>Lay down a first map to start pinning Pages to places. Upload your own chart now, or pull one from the Map Library.</p>
            <div className={styles.actions}>
              <button type="button" className={styles.addMap} disabled={creatingMap} onClick={() => firstMapInputRef.current?.click()}>
                <icons.upload size={16} /> {creatingMap ? 'Charting…' : 'Add a map'}
              </button>
              <button type="button" className={styles.library} disabled aria-disabled="true" title="Map Library — coming soon">
                <icons.canvas size={16} /> Map Library <em>Soon</em>
              </button>
            </div>
            <input ref={firstMapInputRef} className={styles.hiddenFile} type="file" accept="image/*" aria-label="Upload a map image" onChange={(event) => void chartFirstMap(event)} />
          </div>
        </section>
      </main>
    )
  }

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
  // Search covers the Pins actually on the chart, so focusing one always has a
  // Pin to land on. Labelled by its Page for the fuzzy match.
  const pinSearchItems: MapPinItem[] = renderedPins.map((pin) => {
    const page = pageBySlug.get(pin.pageSlug)!
    return { pinId: pin.id, title: page.title, category: page.category, subtitle: categoryMeta(page.category)?.label ?? 'Pin' }
  })

  // Centre the viewport on a Pin (bumping a zoomed-out chart to 1×) and flag it
  // for the one-shot focus ring. The stage's 1600×1080 geometry mirrors the CSS.
  const focusPin = (pinId: string) => {
    const pin = world.pins.find((candidate) => candidate.id === pinId && candidate.mapId === currentMap.id)
    if (!pin) return
    setSelectedPinId(pin.id)
    const nextZoom = Math.max(zoom, 1)
    const rect = viewportRef.current?.getBoundingClientRect()
    const viewport = { width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight }
    const target = clampMapPan(
      { x: -nextZoom * ((pin.x / 100) * 1600 - 800), y: -nextZoom * ((pin.y / 100) * 1080 - 540) },
      nextZoom,
      viewport,
    )
    if (nextZoom !== zoom) { setZooming(true); setZoom(nextZoom) }
    setPan(target)
    setFocusedPinId(pin.id)
  }

  const placingPage = placingPageSlug ? pageBySlug.get(placingPageSlug) : undefined
  const searching = pageQuery.trim().length > 0
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

  const openSettings = () => {
    setTitleDraft(currentMap.title)
    setSettingsOpen((open) => !open)
  }

  // The Chart settings panel edits live, like the rest of the app: the title
  // commits on blur/Enter, and every chart change persists the instant it lands.
  const commitMapTitle = () => {
    const title = titleDraft.trim()
    if (!title || title === currentMap.title) { setTitleDraft(currentMap.title); return }
    void persistMapState(renameMap(world, currentMap.id, title))
  }

  const changeMapChart = (key: string, image?: string) => {
    void persistMapState(setMapChart(world, currentMap.id, key, image))
  }

  const changeMapEraLinked = (eraLinked: boolean) => {
    if (eraLinked === currentMap.eraLinked) return
    void persistMapState(setMapEraLinked(world, currentMap.id, eraLinked, world.activeEra, world.eraOrder))
  }

  const setActiveEra = async (eraSlug: string) => {
    if (eraSlug === world.activeEra) return
    setSelectedPinId(undefined)
    closeDock('reader')
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
      // At the zoom bounds the transform is unchanged, so no transitionend
      // would ever fire to release the promoted layer — only promote when the
      // stage will actually move. Released in the stage's onTransitionEnd (#62).
      if (next === current) return current
      setZooming(true)
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

  const activeEraTitle = eraPages.find((era) => era.slug === world.activeEra)?.title ?? 'No Active Era'
  const activeEraIndex = Math.max(0, eraPages.findIndex((era) => era.slug === world.activeEra))
  const maxEraWindow = Math.max(0, eraPages.length - ERA_WINDOW)
  const eraScrollable = eraPages.length > ERA_WINDOW
  const shiftEraWindow = (delta: number) =>
    setEraWindow((prev) => Math.min(maxEraWindow, Math.max(0, prev + delta)))

  const breadcrumbOrigin = (targetIndex: number) => {
    const firstDescendant = breadcrumbs[targetIndex + 1]
    const originPin = firstDescendant?.parentPin ? world.pins.find((pin) => pin.id === firstDescendant.parentPin) : undefined
    return originPin ? { x: originPin.x, y: originPin.y } : { x: 50, y: 50 }
  }

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link to="/worlds" className={styles.crumbRoot} title="Worlds"><icons.worlds size={15} /><span>Worlds</span></Link>
          <Link to={`/w/${world.slug}`} className={styles.crumbWorld} title={world.name}>{world.name}</Link>
          <span className={styles.crumbCurrent} aria-current="page"><span className={styles.crumbIcon}><icons.map size={15} /></span><span className={styles.crumbLabel}>World Map</span></span>
        </nav>

        <button type="button" className={styles.searchTrigger} onClick={() => setSearchOpen(true)}><icons.search size={16} /> <span>Search Pins…</span><kbd>⌘K</kbd></button>

        <div className={styles.rightChrome}>
          <div className={styles.mapActions}>
            <button type="button" className={styles.actionBtn} aria-pressed={editing} onClick={() => { setEditing((value) => !value); setPlacingPageSlug(undefined) }}><icons.edit size={15} /> <span>Edit layout</span></button>
            <button type="button" className={styles.actionPrimary} onClick={() => { setPickerOpen(true); setPageQuery('') }}><icons.marker size={15} /> <span>Add Pin</span></button>
            <Link className={styles.actionBtn} to={`/w/${world.slug}/library`}><icons.canvas size={15} /> <span>Map Library</span></Link>
            <button type="button" className={styles.actionIcon} aria-label="Map settings" onClick={openSettings}><icons.settings size={22} /></button>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className={styles.mapArea} data-editing={editing || undefined}>
        <div className={styles.editFrame} aria-hidden="true" />
        <div className={styles.mapContext}>
          {breadcrumbs.length > 1 && (
            <button
              type="button"
              className={styles.ascend}
              aria-label={`Surface up to ${breadcrumbs[breadcrumbs.length - 2].title}`}
              onClick={() => navigateMap(breadcrumbs[breadcrumbs.length - 2].id, 'out', breadcrumbOrigin(breadcrumbs.length - 2))}
            >
              <icons.levelUp size={14} aria-hidden="true" />
              <span>Up to {breadcrumbs[breadcrumbs.length - 2].title}</span>
            </button>
          )}
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
        </div>

        <div className={styles.zoomControls} aria-label="Map zoom controls">
          <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-ZOOM_STEP)}><icons.minus size={14} /></button>
          <button type="button" aria-label="Reset map view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => changeZoom(ZOOM_STEP)}><icons.add size={14} /></button>
        </div>

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
                  data-focused={pin.id === focusedPinId || undefined}
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
                  onClick={(event) => { event.stopPropagation(); setSelectedPinId(pin.id) }}
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
          <motion.aside className={styles.inspector} aria-label="Pin inspector" data-editing={editing || undefined} initial={{ opacity: 1 }} exit={{ opacity: 0, x: 12 }} transition={overlayExitTransition(motionScale)}>
            <button type="button" className={styles.closeInspector} aria-label="Close Pin inspector" onClick={() => { setSelectedPinId(undefined); closeDock('reader') }}><icons.close /></button>

            {editing && (
              <p className={styles.editBadge}><icons.grip size={13} aria-hidden="true" /> Editing layout</p>
            )}

            {/* Cover present → banner with the category eyebrow + title riding on a
                scrim. Absent → the header is title and text only, no placeholder art. */}
            {selectedPage.cover ? (
              <header className={styles.cover} style={{ '--cat': `var(--cat-${selectedPage.category})` } as CSSProperties}>
                <img src={selectedPage.cover} alt="" />
                <div className={styles.coverText}>
                  <span className={styles.eyebrow}>{categoryMeta(selectedPage.category)?.label}</span>
                  <h2>{selectedPage.title}</h2>
                </div>
              </header>
            ) : (
              <header className={styles.plainHead}>
                <span className={styles.eyebrow} style={{ color: `var(--cat-${selectedPage.category})` }}>{categoryMeta(selectedPage.category)?.label}</span>
                <h2>{selectedPage.title}</h2>
              </header>
            )}

            <div className={styles.dossier} style={{ '--cat': `var(--cat-${selectedPage.category})` } as CSSProperties}>
              <p className={styles.summary}>{dossierBlurb(selectedPage)}</p>
              <small className={styles.pinCount}>Pinned on {selectedPageMapCount} {selectedPageMapCount === 1 ? 'map' : 'maps'}</small>
              {!selectedPinIsVisible && <p className={styles.filteredNotice}>This Pin is hidden in the Active Era.</p>}

              {selectedPageRelations.length > 0 && (
                <section className={styles.relations} aria-label="Relations">
                  {selectedPageRelations.map((relation) => (
                    <div className={styles.relationRow} key={relation.key}>
                      <span className={styles.relationLabel}>{relation.label}</span>
                      <div className={styles.relationLinks}>
                        {relation.slugs.map((slug) => {
                          const target = pageBySlug.get(slug)
                          if (!target) return <span key={slug} className={styles.relationMissing}>{slug}</span>
                          const catStyle = { '--cat': `var(--cat-${target.category})` } as CSSProperties
                          // Map-native: if the related Page sits on this Map, jump the
                          // camera to its Pin; otherwise fall back to opening the Page.
                          const relationPin = world.pins.find((pin) => pin.pageSlug === slug && pin.mapId === currentMap.id)
                          return relationPin ? (
                            <button key={slug} type="button" className={styles.relationLink} data-onmap aria-label={`Go to ${target.title} on this map`} style={catStyle} onClick={() => focusPin(relationPin.id)}>
                              <i aria-hidden="true" />{target.title}
                            </button>
                          ) : (
                            <Link key={slug} className={styles.relationLink} to={`/w/${world.slug}/p/${target.slug}`} viewTransition style={catStyle}>
                              <i aria-hidden="true" />{target.title}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              )}

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

              {selectedPin.childMap && (
                <button
                  type="button"
                  className={styles.drill}
                  aria-label={`Enter ${world.maps.find((map) => map.id === selectedPin.childMap)?.title ?? 'child'} map`}
                  onClick={() => navigateMap(selectedPin.childMap!, 'in', { x: selectedPin.x, y: selectedPin.y })}
                >
                  <span className={styles.drillMark}><icons.map size={18} aria-hidden="true" /></span>
                  <span className={styles.drillText}>
                    <small>Nested map</small>
                    <strong>{world.maps.find((map) => map.id === selectedPin.childMap)?.title ?? 'child'}</strong>
                  </span>
                  <span className={styles.drillGo} aria-hidden="true"><icons.arrowRight size={16} /></span>
                </button>
              )}

              <div className={styles.inspectorActions}>
                <Link to={`/w/${world.slug}/p/${selectedPage.slug}`} viewTransition>Open full page</Link>
                <button type="button" onClick={() => readerOpen ? closeDock('reader') : openDock('reader')}>{readerOpen ? 'Close reader' : 'Read in dock'}</button>
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
            </div>
          </motion.aside>
        )}
        </AnimatePresence>

        <AnimatePresence>
        {readerOpen && selectedPage && (
          <DockableWindow
            key="reader"
            panelId="reader"
            title={selectedPage.title}
            subtitle={categoryMeta(selectedPage.category)?.label}
            defaultMode="floating"
            accent={`var(--cat-${selectedPage.category})`}
            icon={(() => { const ReaderIcon = categoryMeta(selectedPage.category)?.icon ?? icons.marker; return <ReaderIcon size={16} aria-hidden="true" /> })()}
            onClose={() => closeDock('reader')}
          >
            <div className={styles.readerBody}>
              {selectedPage.cover && <img className={styles.readerCover} src={selectedPage.cover} alt="" />}
              {selectedPage.summary?.trim() && <p className={styles.readerLede}>{selectedPage.summary}</p>}
              <PageProperties
                page={selectedPage}
                pages={pages}
                world={world}
                readOnly
                onPropertiesChange={() => {}}
                onLifecycleChange={() => {}}
                onDelete={() => {}}
                onTemplateChange={() => {}}
                onOpenPage={(slug) => navigate(`/w/${world.slug}/p/${slug}`)}
              />
              <PageEditor
                key={selectedPage.slug}
                body={selectedPage.body}
                pages={pages}
                readOnly
                width="100%"
                resolveTitle={(targetSlug) => pageBySlug.get(targetSlug)?.title}
                onNavigate={(targetSlug) => navigate(`/w/${world.slug}/p/${targetSlug}`)}
                onBodyChange={() => {}}
              />
            </div>
          </DockableWindow>
        )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
      {searchOpen && (
        <MapSpotlight items={pinSearchItems} onFocus={focusPin} onClose={() => setSearchOpen(false)} />
      )}
      </AnimatePresence>

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
                // Collapsed by default; an active search reveals every category that still matches.
                const open = searching || expandedCats.has(category)
                return (
                  <section
                    key={category}
                    className={styles.pickerGroup}
                    data-open={open || undefined}
                    style={{ '--cat': `var(--cat-${category})` } as CSSProperties}
                  >
                    <h3 id={`picker-${category}`}>
                      <button
                        type="button"
                        className={styles.groupToggle}
                        aria-expanded={open}
                        aria-controls={`picker-panel-${category}`}
                        onClick={() => setExpandedCats((prev) => {
                          const next = new Set(prev)
                          if (next.has(category)) next.delete(category)
                          else next.add(category)
                          return next
                        })}
                      >
                        <span className={styles.groupIcon}>{meta && <meta.icon size={16} />}</span>
                        <span className={styles.groupLabel}>{meta?.label}</span>
                        <span className={styles.groupCount}>{categoryPages.length}</span>
                        <span className={styles.groupChevron}><icons.caretDown size={13} /></span>
                      </button>
                    </h3>
                    <div className={styles.groupPanel} id={`picker-panel-${category}`} role="region" aria-labelledby={`picker-${category}`}>
                      <div className={styles.groupPanelInner}>
                        {categoryPages.map((page) => (
                          <button type="button" key={page.slug} onClick={() => { setPlacingPageSlug(page.slug); setPickerOpen(false); setEditing(true) }}>
                            Place {page.title}
                          </button>
                        ))}
                      </div>
                    </div>
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
          <header><h2>Chart settings</h2><button type="button" aria-label="Close Map settings" onClick={() => setSettingsOpen(false)}><icons.close /></button></header>
          <div className={styles.settingsForm}>
            <label className={styles.field}>
              <span>Map title</span>
              <input
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitMapTitle}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }}
                placeholder="Untitled map"
                autoFocus
              />
            </label>

            <MapChartEditor
              map={currentMap}
              eraPages={eraPages}
              eraOrder={world.eraOrder}
              activeEra={world.activeEra}
              onEraLinkedChange={changeMapEraLinked}
              onChartChange={changeMapChart}
            />
          </div>
        </motion.section>
      )}
      </AnimatePresence>

      <section className={styles.eraDock} aria-label="Timeline" data-collapsed={eraCollapsed || undefined}>
        <button
          type="button"
          className={styles.eraToggle}
          aria-expanded={!eraCollapsed}
          aria-controls="era-rail-region"
          onClick={() => setEraCollapsed((value) => !value)}
        >
          <span className={styles.eraEyebrow}>Timeline</span>
          <strong key={world.activeEra} className={styles.eraActiveTitle}>{activeEraTitle}</strong>
          <span className={styles.eraToggleIcon} aria-hidden="true"><icons.caretDown size={14} /></span>
        </button>

        <div
          id="era-rail-region"
          className={styles.eraCollapse}
          role="region"
          aria-label="Era timeline"
          data-collapsed={eraCollapsed || undefined}
          inert={eraCollapsed || undefined}
        >
          <div className={styles.eraCollapseInner}>
            <button
              type="button"
              className={styles.eraPager}
              data-edge="start"
              aria-label="Scroll to earlier Eras"
              hidden={!eraScrollable}
              disabled={eraWindow === 0}
              onClick={() => shiftEraWindow(-1)}
            ><icons.caretLeft size={16} /></button>

            <div className={styles.eraViewport}>
              <div
                className={styles.eraTrack}
                data-scrollable={eraScrollable || undefined}
                style={{
                  '--era-window': eraWindow,
                  '--era-count': eraPages.length,
                  '--era-fill': eraPages.length > 1 ? activeEraIndex / (eraPages.length - 1) : 0,
                } as CSSProperties}
              >
                <span className={styles.eraLine} aria-hidden="true" />
                <span className={styles.eraProgress} aria-hidden="true" />
                {eraPages.map((era, index) => {
                  const active = era.slug === world.activeEra
                  return (
                    <button
                      type="button"
                      key={era.slug}
                      className={styles.eraStop}
                      aria-label={`${era.title} · ${eraDateLabel(era)}`}
                      aria-pressed={active}
                      data-active={active || undefined}
                      onClick={() => void setActiveEra(era.slug)}
                    >
                      <span className={styles.eraNode} data-past={index <= activeEraIndex || undefined} data-active={active || undefined} aria-hidden="true"><i /></span>
                      <span className={styles.eraMeta}><strong>{era.title}</strong><small>{eraDateLabel(era)}</small></span>
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              type="button"
              className={styles.eraPager}
              data-edge="end"
              aria-label="Scroll to later Eras"
              hidden={!eraScrollable}
              disabled={eraWindow >= maxEraWindow}
              onClick={() => shiftEraWindow(1)}
            ><icons.caretRight size={16} /></button>
          </div>
        </div>
      </section>

    </main>
  )
}
