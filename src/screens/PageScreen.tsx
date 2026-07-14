// Minimal Page view for issue #20: category eyebrow + serif title +
// PageEditor over the Page's body, saving through the repository. The
// properties block, tags/eras rows, and backlinks panel are later slices.

import type { Editor } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import type { Page } from '../domain/types'
import { PageEditor } from '../editor/PageEditor'
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
  const dashboard = useOutletContext<DashboardOutletContext | undefined>()
  const repo = repository ?? dashboard?.repository ?? getRepository()

  const [status, setStatus] = useState<Status>('loading')
  const [page, setPage] = useState<Page>()
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const lastSavedBodyRef = useRef('')
  const pendingBodyRef = useRef<string | undefined>(undefined)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveInFlightRef = useRef(false)
  const flushRef = useRef<() => void>(() => {})
  // Pinned when the Page loads, so a flush on unmount/navigation always
  // writes to the Page it was edited on — never the next route's params.
  const saveTargetRef = useRef<{ world: string; slug: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setSaveState('idle')
    Promise.all([repo.getPage(world, slug), repo.listPages(world)])
      .then(([loaded, pages]) => {
        if (cancelled) return
        setTitles(new Map(pages.map((p) => [p.slug, p.title])))
        if (loaded) {
          lastSavedBodyRef.current = loaded.body
          saveTargetRef.current = { world, slug: loaded.slug }
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
        setTitles((prev) => new Map(prev).set(created.slug, created.title))
        setPage(created)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
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

  if (status === 'error' || !page) {
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
        <div className={styles.tags} aria-label="Tags">{page.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
        <span className={styles.saveState} data-save-state={saveState}>
          {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : ''}
        </span>
      </header>
      <PageEditor
        key={page.slug}
        body={page.body}
        resolveTitle={(s) => titles.get(s)}
        onBodyChange={handleBodyChange}
        readOnly={dashboard?.readOnly}
        onEditorReady={onEditorReady}
      />
    </main>
  )
}
