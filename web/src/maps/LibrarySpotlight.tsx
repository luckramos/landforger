import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import type { MapFolder, WorldMap } from '../domain/types'
import { fuzzyMatch, splitGraphemes } from '../search/spotlightSearch'
import { folderPath, mapsInFolder } from './mapDomain'
import { icons } from '../icons'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import styles from './LibrarySpotlight.module.css'

interface LibrarySpotlightProps {
  worldSlug: string
  maps: readonly WorldMap[]
  folders: readonly MapFolder[]
  onClose: () => void
  onOpenFolder: (folderId: string) => void
}

interface Hit {
  kind: 'folder' | 'map'
  id: string
  title: string
  subtitle: string
  score: number
  indices: number[]
}

function HighlightedTitle({ title, indices }: { title: string; indices: readonly number[] }) {
  const highlighted = new Set(indices)
  return splitGraphemes(title).map((character, index) => (
    highlighted.has(index) ? <mark key={index}>{character}</mark> : character
  ))
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** Fuzzy search across the Library's folders and charts; folders open in place, charts open the viewer. */
export function LibrarySpotlight({ worldSlug, maps, folders, onClose, onOpenFolder }: LibrarySpotlightProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const navigate = useNavigate()

  const folderName = (id: string) => folders.find((folder) => folder.id === id)?.name

  const results = useMemo<Hit[]>(() => {
    const entries: Omit<Hit, 'score' | 'indices'>[] = [
      ...folders.map((folder) => ({
        kind: 'folder' as const,
        id: folder.id,
        title: folder.name,
        subtitle: folderPath(folders, folder.id).map((crumb) => crumb.name).slice(0, -1).join(' / ') || 'Library root',
      })),
      ...maps.map((map) => ({
        kind: 'map' as const,
        id: map.id,
        title: map.title,
        subtitle: map.folder ? (folderName(map.folder) ?? 'Library root') : 'Library root',
      })),
    ]
    const trimmed = query.trim()
    if (!trimmed) return entries.map((entry) => ({ ...entry, score: 0, indices: [] }))
    return entries
      .map((entry) => ({ entry, match: fuzzyMatch(entry.title, trimmed) }))
      .filter((row): row is { entry: typeof row.entry; match: NonNullable<typeof row.match> } => row.match !== null)
      .sort((a, b) => b.match.score - a.match.score)
      .map((row) => ({ ...row.entry, score: row.match.score, indices: row.match.indices }))
  }, [query, maps, folders])

  useEffect(() => {
    inputRef.current?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)))
  }, [results.length])

  useEffect(() => {
    document.getElementById(`library-result-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedIndex])

  const openResult = (hit: Hit) => {
    onClose()
    if (hit.kind === 'folder') onOpenFolder(hit.id)
    else navigate(`/w/${worldSlug}/map/${hit.id}`)
  }

  return (
    <motion.div className={styles.scrim} role="presentation" onMouseDown={onClose} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
      <motion.section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search the Library"
        initial={false}
        exit={{ opacity: 0, y: -6, scale: 0.985 }}
        transition={overlayExitTransition(motionScale)}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          } else if (event.key === 'ArrowDown' && results.length > 0) {
            event.preventDefault()
            setSelectedIndex((current) => (current + 1) % results.length)
          } else if (event.key === 'ArrowUp' && results.length > 0) {
            event.preventDefault()
            setSelectedIndex((current) => (current - 1 + results.length) % results.length)
          } else if (event.key === 'Enter' && results[selectedIndex]) {
            event.preventDefault()
            openResult(results[selectedIndex])
          }
        }}
      >
        <div className={styles.inputRow}>
          <span aria-hidden="true"><icons.search size={16} /></span>
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search maps and folders"
            aria-expanded="true"
            aria-controls="library-results"
            aria-activedescendant={results[selectedIndex] ? `library-result-${selectedIndex}` : undefined}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0) }}
            placeholder="Search maps and folders…"
          />
          <kbd>ESC</kbd>
        </div>
        <div id="library-results" className={styles.results} role="listbox" aria-label="Search results">
          {results.map((hit, index) => (
            <button
              key={`${hit.kind}:${hit.id}`}
              id={`library-result-${index}`}
              type="button"
              className={styles.result}
              role="option"
              aria-selected={index === selectedIndex}
              aria-label={`${hit.title}, ${hit.kind === 'folder' ? 'folder' : 'map'}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => openResult(hit)}
            >
              <span className={styles.resultIcon} data-kind={hit.kind}>{hit.kind === 'folder' ? <icons.canvas size={16} /> : <icons.map size={16} />}</span>
              <span className={styles.resultCopy}>
                <strong title={hit.title}><HighlightedTitle title={hit.title} indices={hit.indices} /></strong>
                <small title={hit.subtitle}>{hit.subtitle}</small>
              </span>
              <span className={styles.resultKind}>{hit.kind === 'folder' ? plural(mapsInFolder(maps, hit.id).length, 'chart') : 'Chart'}</span>
            </button>
          ))}
          {results.length === 0 && <p className={styles.empty}>No maps or folders match “{query}”.</p>}
        </div>
        <footer className={styles.footer}>
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>ESC</kbd> Close</span>
        </footer>
      </motion.section>
    </motion.div>
  )
}
