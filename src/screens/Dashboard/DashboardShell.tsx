import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Link, matchPath, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ReferenceCanvasPanel } from '../../canvas/ReferenceCanvasPanel'
import { UserMenu } from '../../components/UserMenu/UserMenu'
import type { Page, World } from '../../domain/types'
import type { WorldRepository } from '../../repository/WorldRepository'
import { getRepository } from '../../state/repository'
import { TimelinePanel } from '../../timeline/TimelinePanel'
import { GraphPanel } from '../../graph/GraphPanel'
import { icons } from '../../icons'
import { CATEGORY_META, categoryMeta } from './categoryMeta'
import { SpotlightSearch } from './SpotlightSearch'
import styles from './DashboardShell.module.css'

export interface DashboardOutletContext {
  world: World
  pages: Page[]
  repository: WorldRepository
  readOnly: boolean
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
  const currentPage = pageSlug ? pages.find((page) => page.slug === pageSlug) : undefined
  const currentLabel = currentPage?.title ?? categoryMeta(categorySlug ?? '')?.label ?? (tagSlug ? `#${tagSlug}` : undefined)
  const closePanel = () => {
    const next = new URLSearchParams(location.search)
    next.delete('panel')
    next.delete('focus')
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
  }
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
            <Link to={`/w/${world.slug}`} className={styles.brand} aria-label={`${world.name} home`}>
              <span className={styles.brandMark}>
                <img src="/landforger-icon.svg" alt="" aria-hidden="true" />
              </span>
              <span className={styles.expandedOnly}><strong>LandForger</strong><small>{world.slug}</small></span>
            </Link>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setSidebarCollapsed((value) => !value)}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>

          <Link className={styles.newPage} to={`/w/${world.slug}/new`}>
            <span>＋</span><span className={styles.expandedOnly}>New page</span>
          </Link>

          <nav className={styles.primaryNav}>
            <Link className={styles.navItem} to={`/w/${world.slug}`}>
              <span>⌂</span><span className={styles.expandedOnly}>All pages</span><b className={styles.expandedOnly}>{pages.length}</b>
            </Link>
            {CATEGORY_META.map((item) => (
              <Link key={item.category} className={styles.navItem} to={`/w/${world.slug}/c/${item.category}`}>
                <span style={{ color: `var(--cat-${item.category})` }}>{item.icon}</span>
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
            <Link className={styles.navItem} to={`/w/${world.slug}/map`}><span>⌖</span><span className={styles.expandedOnly}>World map</span></Link>
            <Link className={styles.navItem} to={`/w/${world.slug}?panel=timeline`}><span>◴</span><span className={styles.expandedOnly}>Timeline</span></Link>
            <Link className={styles.navItem} to={`/w/${world.slug}?panel=graph`}><span>✳</span><span className={styles.expandedOnly}>Graph view</span></Link>
            <Link className={styles.navItem} to={`/w/${world.slug}?panel=canvas`}><span>▱</span><span className={styles.expandedOnly}>Reference canvas</span></Link>
          </nav>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topbar} aria-hidden={focusMode || undefined}>
            <Link to="/worlds" className={styles.worldsBack}>‹ Worlds</Link>
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              <Link to={`/w/${world.slug}`}>{world.name}</Link>
              {currentLabel && <><span>/</span><span>{currentLabel}</span></>}
            </nav>
            <button type="button" className={styles.searchTrigger} onClick={() => setSearchOpen(true)}>⌕ <span>Search the world…</span><kbd>⌘K</kbd></button>
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
            <button type="button" className={styles.topbarButton} aria-label="Enter focus mode" onClick={() => setFocusMode(true)}>◎</button>
            <UserMenu />
        </header>

        {focusMode && <button type="button" className={styles.exitFocus} aria-label="Exit focus mode" onClick={() => setFocusMode(false)}>× Exit focus</button>}

        <div key={`${location.pathname}${location.search}`} className={styles.view} data-route-key={location.pathname}>
          <Outlet context={{ world, pages, repository, readOnly } satisfies DashboardOutletContext} />
        </div>
      </div>

      <AnimatePresence>
      {panel === 'timeline' && (
        <TimelinePanel
          world={world}
          pages={pages}
          repository={repository}
          focusPage={focusedPageSlug}
          onClose={closePanel}
          onNavigatePage={(slug) => navigate(`/w/${world.slug}/p/${slug}?panel=timeline`)}
        />
      )}

      {panel === 'graph' && (
        <GraphPanel
          world={world}
          pages={pages}
          focalSlug={pageSlug}
          onClose={closePanel}
          onNavigatePage={(slug) => navigate(`/w/${world.slug}/p/${slug}`)}
        />
      )}

      {panel === 'canvas' && (
        <ReferenceCanvasPanel world={world} repository={repository} onClose={closePanel} />
      )}

      {searchOpen && (
        <SpotlightSearch pages={pages} worldSlug={world.slug} onClose={() => setSearchOpen(false)} />
      )}
      </AnimatePresence>
    </div>
  )
}
