import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Link, matchPath, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DockLayer } from '../../components/DockableWindow/DockLayer'
import { UserMenu } from '../../components/UserMenu/UserMenu'
import type { Category, Page, World } from '../../domain/types'
import type { WorldRepository } from '../../repository/WorldRepository'
import { getRepository } from '../../state/repository'
import { isDockPanelId, useDockStore } from '../../state/dockStore'
import { icons } from '../../icons'
import { CATEGORY_META, categoryMeta } from './categoryMeta'
import { SpotlightSearch } from './SpotlightSearch'
import styles from './DashboardShell.module.css'

export interface DashboardOutletContext {
  world: World
  pages: Page[]
  repository: WorldRepository
  readOnly: boolean
  /** Distraction-free mode — screens hide their own floating chrome when true. */
  focusMode: boolean
}

type LoadState = 'loading' | 'ready' | 'missing' | 'error'

export function DashboardShell() {
  const { world: worldSlug = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const searchParams = new URLSearchParams(location.search)
  const panel = searchParams.get('panel')
  const focusedPageSlug = searchParams.get('focus') ?? undefined
  const repository = getRepository()
  const openDock = useDockStore((state) => state.open)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [world, setWorld] = useState<World>()
  const [pages, setPages] = useState<Page[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
        setWorld(loadedWorld)
        setPages(loadedPages)
        setLoadState('ready')
      })
      .catch(() => !cancelled && setLoadState('error'))
    return () => {
      cancelled = true
    }
  }, [repository, worldSlug])

  useEffect(() => {
    let active = true
    const unsubscribe = repository.subscribeToMutations((mutation) => {
      if (mutation.worldSlug !== worldSlug) return
      setSaving(true)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => setSaving(false), 1400)
      // Mutation notifications are synchronous; refresh after the write has completed.
      queueMicrotask(() => {
        if (!active) return
        Promise.all([repository.getWorld(worldSlug), repository.listPages(worldSlug)]).then(([nextWorld, nextPages]) => {
          if (!active) return
          if (nextWorld) setWorld(nextWorld)
          setPages(nextPages)
        })
      })
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [repository, worldSlug])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  useEffect(() => {
    if (!focusMode) return
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false)
    }
    document.addEventListener('keydown', exitOnEscape)
    return () => document.removeEventListener('keydown', exitOnEscape)
  }, [focusMode])

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', handleSearchShortcut)
    return () => document.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  /* `?panel=<id>` is a deep-link entry point, not state: it opens the named
     window once and is then stripped, so navigation and the Back button never
     fight the store over what is on screen. */
  useEffect(() => {
    if (!isDockPanelId(panel)) return
    openDock(panel)
    const next = new URLSearchParams(location.search)
    next.delete('panel')
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
  }, [panel, location.pathname, location.search, navigate, openDock])

  const counts = useMemo(
    () => new Map(CATEGORY_META.map(({ category }) => [category, pages.filter((page) => page.category === category).length])),
    [pages],
  )

  const topTags = useMemo(() => {
    const frequencies = new Map<string, number>()
    for (const page of pages) for (const pageTag of page.tags) frequencies.set(pageTag, (frequencies.get(pageTag) ?? 0) + 1)
    return [...frequencies]
      .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b))
      .slice(0, 9)
  }, [pages])

  const pageSlug = matchPath('/w/:world/p/:slug', location.pathname)?.params.slug
  const categorySlug = matchPath('/w/:world/c/:category', location.pathname)?.params.category
  const tagSlug = matchPath('/w/:world/t/:tag', location.pathname)?.params.tag
  const isMap = Boolean(matchPath('/w/:world/map', location.pathname))
  const currentPage = pageSlug ? pages.find((page) => page.slug === pageSlug) : undefined
  // The trailing breadcrumb segment: a page (carries its Category identity), a
  // Category listing, a Tag listing, or the Map. `category` — when present —
  // tints the leading glyph with the same --cat-* color the sidebar uses.
  const currentCrumb: { label: string; category?: Category; icon?: keyof typeof icons } | undefined = currentPage
    ? { label: currentPage.title, category: currentPage.category }
    : categorySlug && categoryMeta(categorySlug)
      ? { label: categoryMeta(categorySlug)!.label, category: categorySlug as Category }
      : tagSlug
        ? { label: `#${tagSlug}` }
        : isMap
          ? { label: 'World map', icon: 'map' }
          : undefined
  const CrumbIcon = currentCrumb?.category
    ? categoryMeta(currentCrumb.category)!.icon
    : currentCrumb?.icon
      ? icons[currentCrumb.icon]
      : undefined
  // "Saved", read-only and focus mode are Page-scoped controls — they only
  // make sense while a Page is open, so the topbar surfaces them there alone.
  const onPage = Boolean(pageSlug)
  if (loadState !== 'ready' || !world) {
    return (
      <main className={styles.loading}>
        {loadState === 'missing' ? 'World not found.' : loadState === 'error' ? "This World couldn't be loaded." : 'Loading World…'}
      </main>
    )
  }

  return (
    <div
      className={styles.shell}
      data-testid="dashboard-shell"
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
      data-focus={focusMode}
    >
      <aside className={styles.sidebar} aria-label="World navigation" aria-hidden={focusMode || undefined}>
          <div className={styles.brandRow}>
            <Link to={`/w/${world.slug}`} className={styles.brand} aria-label={`${world.name} · LandForger home`}>
              {/* Full lockup in the expanded rail, emblem-only when collapsed —
                  both are left-anchored and cross-dissolve on collapse. */}
              <img className={styles.brandFull} src="/landforger.svg" alt="" aria-hidden="true" />
              <img className={styles.brandIcon} src="/landforger-icon.svg" alt="" aria-hidden="true" />
            </Link>
          </div>

          <Link className={styles.newPage} to={`/w/${world.slug}/new`}>
            <span><icons.add size={18} /></span><span className={styles.expandedOnly}>New page</span>
          </Link>

          <nav className={styles.primaryNav}>
            <Link className={styles.navItem} to={`/w/${world.slug}`}>
              <span><icons.home /></span><span className={styles.expandedOnly}>All pages</span><b className={styles.expandedOnly}>{pages.length}</b>
            </Link>
            {CATEGORY_META.map((item) => (
              <Link key={item.category} className={styles.navItem} to={`/w/${world.slug}/c/${item.category}`}>
                <span style={{ color: `var(--cat-${item.category})` } as CSSProperties}><item.icon /></span>
                <span className={styles.expandedOnly}>{item.label}</span>
                <b className={styles.expandedOnly}>{counts.get(item.category)}</b>
              </Link>
            ))}
          </nav>

          <section className={`${styles.tags} ${styles.expandedOnly}`} aria-label="Top tags">
            <h2>Top tags</h2>
            <div>{topTags.map(([name, count]) => <Link key={name} to={`/w/${world.slug}/t/${name}`}>#{name}<small>{count}</small></Link>)}</div>
          </section>

          <nav className={styles.bottomNav}>
            <Link className={styles.navItem} to={`/w/${world.slug}/map`}><span><icons.map /></span><span className={styles.expandedOnly}>World map</span></Link>
            <button type="button" className={styles.navItem} onClick={() => openDock('timeline')}><span><icons.timeline /></span><span className={styles.expandedOnly}>Timeline</span></button>
            <button type="button" className={styles.navItem} onClick={() => openDock('graph')}><span><icons.graph /></span><span className={styles.expandedOnly}>Graph view</span></button>
            <button type="button" className={styles.navItem} onClick={() => openDock('canvas')}><span><icons.canvas /></span><span className={styles.expandedOnly}>Reference canvas</span></button>
          </nav>
      </aside>

      {/* Collapse toggle lives on the shell — outside the sidebar's clipped box
          — as a disc straddling the right edge, vertically centred. It rides
          the animating edge on collapse without re-entering the brand row, so
          nothing below it ever shifts. */}
      <button
        type="button"
        className={styles.collapseEdge}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setSidebarCollapsed((value) => !value)}
      >
        {sidebarCollapsed ? <icons.caretRight size={15} /> : <icons.caretLeft size={15} />}
      </button>

      <div className={styles.mainColumn}>
        <header className={styles.topbar} aria-hidden={focusMode || undefined}>
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              <Link to="/worlds" className={styles.crumbRoot} title="Back to Worlds">
                <icons.worlds size={15} />
                <span>Back to Worlds</span>
              </Link>
              <Link to={`/w/${world.slug}`} className={styles.crumbWorld} title={world.name}>{world.name}</Link>
              {currentCrumb && (
                <span className={styles.crumbCurrent} aria-current="page">
                  {CrumbIcon && (
                    <span
                      className={styles.crumbIcon}
                      style={currentCrumb.category ? ({ color: `var(--cat-${currentCrumb.category})` } as CSSProperties) : undefined}
                    >
                      <CrumbIcon size={15} />
                    </span>
                  )}
                  <span className={styles.crumbLabel} title={currentCrumb.label}>{currentCrumb.label}</span>
                </span>
              )}
            </nav>

            <button type="button" className={styles.searchTrigger} onClick={() => setSearchOpen(true)}><icons.search size={16} /> <span>Search the world…</span><kbd>⌘K</kbd></button>

            <div className={styles.rightChrome}>
              {onPage && (
                <div className={styles.pageTools} role="group" aria-label="Page tools">
                  <span className={styles.saveIndicator} data-testid="save-indicator" data-saving={saving || undefined}>
                    <i />{saving ? 'Saving' : 'Saved'}
                  </span>
                  <button
                    type="button"
                    className={styles.topbarButton}
                    aria-label={readOnly ? 'Disable read-only' : 'Enable read-only'}
                    aria-pressed={readOnly}
                    onClick={() => setReadOnly((value) => !value)}
                  >
                    {readOnly ? <icons.lock /> : <icons.unlock />}
                  </button>
                  <button type="button" className={styles.topbarButton} aria-label="Enter focus mode" onClick={() => setFocusMode(true)}><icons.focus /></button>
                </div>
              )}
              <UserMenu />
            </div>
        </header>

        {focusMode && <button type="button" className={styles.exitFocus} aria-label="Exit focus mode" onClick={() => setFocusMode(false)}><icons.close size={14} /> Exit focus</button>}

        <div key={location.pathname} className={styles.view} data-route-key={location.pathname}>
          <Outlet context={{ world, pages, repository, readOnly, focusMode } satisfies DashboardOutletContext} />
        </div>
      </div>

      <DockLayer
        world={world}
        pages={pages}
        repository={repository}
        focusedPageSlug={focusedPageSlug}
        pageSlug={pageSlug}
      />

      <AnimatePresence>
      {searchOpen && (
        <SpotlightSearch pages={pages} worldSlug={world.slug} onClose={() => setSearchOpen(false)} />
      )}
      </AnimatePresence>
    </div>
  )
}
