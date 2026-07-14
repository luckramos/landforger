// Page view: repository-backed editor, Wikilink navigation/soft-404 and the
// derived, grouped "Mentioned in" panel.

import type { Editor } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { Backlink } from '../domain/backlinks'
import type { Category, CustomProperty, Page, PropertyDef, World } from '../domain/types'
import { PageEditor } from '../editor/PageEditor'
import { PageProperties } from '../properties/PageProperties'
import type { WorldRepository } from '../repository/WorldRepository'
import { getRepository } from '../state/repository'
import styles from './PageScreen.module.css'
import type { DashboardOutletContext } from './Dashboard/DashboardShell'

const SAVE_DEBOUNCE_MS = 800

type Status = 'loading' | 'ready' | 'missing' | 'error'
type SaveState = 'idle' | 'saving' | 'saved'

export interface PageScreenProps {
  /** Injected in tests; defaults to the app-wide repository from `getRepository()`. */
  repository?: WorldRepository
  /** Test seam, forwarded to PageEditor. */
  onEditorReady?: (editor: Editor) => void
}

export function PageScreen({ repository, onEditorReady }: PageScreenProps) {
  const { world = '', slug = '' } = useParams()
  const navigate = useNavigate()
  const dashboard = useOutletContext<DashboardOutletContext | undefined>()
  const repo = repository ?? dashboard?.repository ?? getRepository()

  const [status, setStatus] = useState<Status>('loading')
  const [page, setPage] = useState<Page>()
  const [worldData, setWorldData] = useState<World>()
  const [pages, setPages] = useState<Page[]>([])
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const lastSavedBodyRef = useRef('')
  const pendingBodyRef = useRef<string | undefined>(undefined)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveInFlightRef = useRef(false)
  const flushRef = useRef<() => void>(() => {})
  // Pinned when the Page loads, so a flush on unmount/navigation always
  // writes to the Page it was edited on — never the next route's params.
  const saveTargetRef = useRef<{ world: string; slug: string } | null>(null)
  const pageRef = useRef<Page | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setSaveState('idle')
    Promise.all([repo.getPage(world, slug), repo.listPages(world), repo.getBacklinks(world, slug), repo.getWorld(world)])
      .then(([loaded, loadedPages, loadedBacklinks, loadedWorld]) => {
        if (cancelled) return
        setPages(loadedPages)
        setBacklinks(loadedBacklinks)
        setWorldData(loadedWorld)
        if (loaded) {
          lastSavedBodyRef.current = loaded.body
          saveTargetRef.current = { world, slug: loaded.slug }
          pageRef.current = loaded
          setPage(loaded)
          setStatus('ready')
        } else {
          setStatus('missing')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
      // Don't lose an edit sitting inside the debounce window.
      clearTimeout(saveTimerRef.current)
      flushRef.current()
    }
    // repo identity is stable for a given `repository` prop / default singleton
  }, [repo, world, slug])

  // Save through the repository, debounced, ONLY when the doc actually
  // changed (dirty check per the PRD — unchanged docs never rewrite MD).
  const flush = () => {
    const md = pendingBodyRef.current
    const target = saveTargetRef.current
    if (saveInFlightRef.current || md === undefined || target === null) return
    if (md === lastSavedBodyRef.current) {
      pendingBodyRef.current = undefined
      return
    }
    saveInFlightRef.current = true
    setSaveState('saving')
    repo
      .updatePage(target.world, target.slug, { body: md })
      .then(() => {
        lastSavedBodyRef.current = md
        if (pendingBodyRef.current === md) pendingBodyRef.current = undefined
        setSaveState('saved')
      })
      .catch(() => setSaveState('idle'))
      .finally(() => {
        saveInFlightRef.current = false
        if (pendingBodyRef.current !== undefined && pendingBodyRef.current !== lastSavedBodyRef.current) {
          flushRef.current()
        }
      })
  }
  flushRef.current = flush

  const handleBodyChange = (md: string) => {
    pendingBodyRef.current = md
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => flushRef.current(), SAVE_DEBOUNCE_MS)
  }

  const createMissingPage = () => {
    // Titleize the requested Slug; slugify() reproduces it, so the created
    // Page lands on this URL. Category defaults to `stories` until the
    // create-view slice brings the category selector.
    const title = slug
      .split('-')
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(' ')
    repo
      .createPage(world, { title, category: 'stories' })
      .then((created) => {
        lastSavedBodyRef.current = created.body
        saveTargetRef.current = { world, slug: created.slug }
        setPages((prev) => [...prev, created])
        setBacklinks([])
        pageRef.current = created
        setPage(created)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  const acceptPage = (next: Page) => {
    pageRef.current = next
    setPage(next)
    setPages((current) => current.map((candidate) => candidate.slug === next.slug ? next : candidate))
  }

  const persistPagePatch = (createPatch: (current: Page) => Partial<Page>) => {
    const current = pageRef.current
    if (!current) return
    const patch = createPatch(current)
    const optimistic = { ...current, ...patch, slug: current.slug, created: current.created }
    acceptPage(optimistic)
    setSaveState('saving')
    repo.updatePage(world, current.slug, patch).then((saved) => {
      acceptPage(saved)
      setSaveState('saved')
    }).catch(() => {
      acceptPage(current)
      setSaveState('idle')
    })
  }

  const handleLifecycleChange = async (title: string, category: Category, applyTemplate: boolean) => {
    const before = pageRef.current
    if (!before) return
    try {
      setSaveState('saving')
      let changed = before
      if (category !== changed.category) {
        changed = await repo.recategorizePage(world, changed.slug, category, { applyTemplate })
      }
      if (title && title !== changed.title) changed = await repo.updatePage(world, changed.slug, { title })
      acceptPage(changed)
      setSaveState('saved')
    } catch {
      acceptPage(before)
      setSaveState('idle')
    }
  }

  const handleTemplateChange = (category: Category, properties: PropertyDef[]) => {
    if (!worldData) return
    const categoryTemplates = worldData.categoryTemplates.some((template) => template.category === category)
      ? worldData.categoryTemplates.map((template) => template.category === category ? { category, properties } : template)
      : [...worldData.categoryTemplates, { category, properties }]
    const optimistic = { ...worldData, categoryTemplates }
    setWorldData(optimistic)
    repo.updateWorld(world, { categoryTemplates }).then(setWorldData).catch(() => setWorldData(worldData))
  }

  const handleDelete = () => {
    const target = pageRef.current
    if (!target) return
    clearTimeout(saveTimerRef.current)
    pendingBodyRef.current = undefined
    repo.deletePage(world, target.slug).then(() => navigate(`/w/${world}`)).catch(() => setStatus('error'))
  }

  if (status === 'loading') {
    return (
      <main className={styles.screen}>
        <p className={styles.stateText}>Loading…</p>
      </main>
    )
  }

  if (status === 'missing') {
    return (
      <main className={`${styles.screen} ${styles.missing}`}>
        <span className={styles.eyebrow}>Off the map</span>
        <h1 className={styles.title}>Nothing charted at “{slug}”</h1>
        <button type="button" className={styles.createButton} onClick={createMissingPage}>
          Create '{slug}' page?
        </button>
      </main>
    )
  }

  if (status === 'error' || !page || !worldData) {
    return (
      <main className={styles.screen}>
        <p className={styles.stateText}>This page couldn't be loaded.</p>
      </main>
    )
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        {page.cover && <img className={styles.cover} src={page.cover} alt="" />}
        <span className={styles.eyebrow}>{page.category}</span>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.summary}>{page.summary}</p>
        <button
          type="button"
          className={styles.graphButton}
          aria-label="Open local relationship graph"
          onClick={() => navigate(`/w/${world}/p/${page.slug}?panel=graph`)}
        >
          ✳ <span>Connections</span>
        </button>
        <span className={styles.saveState} data-save-state={saveState}>
          {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : ''}
        </span>
      </header>
      <PageProperties
        page={page}
        pages={pages}
        world={worldData}
        readOnly={dashboard?.readOnly}
        onPropertiesChange={(change: (properties: CustomProperty[]) => CustomProperty[]) => persistPagePatch((current) => ({ customProperties: change(current.customProperties) }))}
        onTagsChange={(change) => persistPagePatch((current) => ({ tags: change(current.tags) }))}
        onErasChange={(change) => persistPagePatch((current) => ({ eras: change(current.eras) }))}
        onCoverChange={(cover) => persistPagePatch(() => ({ cover }))}
        onLifecycleChange={handleLifecycleChange}
        onDelete={handleDelete}
        onTemplateChange={handleTemplateChange}
        onSeeTimeline={() => navigate(`/w/${world}?panel=timeline&focus=${page.slug}`)}
      />
      <PageEditor
        key={page.slug}
        body={page.body}
        resolveTitle={(targetSlug) => pages.find((candidate) => candidate.slug === targetSlug)?.title}
        pages={pages}
        onNavigate={(targetSlug) => navigate(`/w/${world}/p/${targetSlug}`)}
        onBodyChange={handleBodyChange}
        readOnly={dashboard?.readOnly}
        onEditorReady={onEditorReady}
      />
      <BacklinksPanel
        backlinks={backlinks}
        onNavigate={(sourceSlug) => navigate(`/w/${world}/p/${sourceSlug}`)}
      />
    </main>
  )
}

function BacklinksPanel({ backlinks, onNavigate }: { backlinks: Backlink[]; onNavigate: (slug: string) => void }) {
  const [open, setOpen] = useState(true)
  const grouped = new Map<Backlink['sourceCategory'], Backlink[]>()
  for (const backlink of backlinks) {
    const entries = grouped.get(backlink.sourceCategory) ?? []
    entries.push(backlink)
    grouped.set(backlink.sourceCategory, entries)
  }

  return (
    <section className={styles.backlinks} aria-label="Mentioned in">
      <button
        type="button"
        className={styles.backlinksToggle}
        aria-expanded={open}
        aria-controls="page-backlinks"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={open ? styles.backlinksCaretOpen : styles.backlinksCaret}>▶</span>
        <span>Mentioned in</span>
        <span className={styles.backlinksCount}>{backlinks.length}</span>
      </button>
      {open && (
        <div id="page-backlinks" className={styles.backlinksGroups}>
          {[...grouped.entries()].map(([category, entries]) => (
            <div key={category} className={styles.backlinksGroup}>
              <h3 className={styles.backlinksCategory}>{category}</h3>
              {entries.map((backlink) => (
                <a
                  key={backlink.sourceSlug}
                  href={`./${backlink.sourceSlug}`}
                  className={styles.backlinkRow}
                  aria-label={backlink.sourceTitle}
                  onClick={(event) => {
                    event.preventDefault()
                    onNavigate(backlink.sourceSlug)
                  }}
                >
                  <strong>{backlink.sourceTitle}</strong>
                  <span>{backlink.snippet}</span>
                </a>
              ))}
            </div>
          ))}
          {backlinks.length === 0 && <p className={styles.noBacklinks}>No Pages point here yet.</p>}
        </div>
      )}
    </section>
  )
}
