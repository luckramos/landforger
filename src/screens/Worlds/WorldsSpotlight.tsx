import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { overlayExitTransition } from '../../components/motionPrefs'
import { useUiStore } from '../../state/uiStore'
import type { World } from '../../domain/types'
import { icons } from '../../icons'
import { splitGraphemes } from '../../search/spotlightSearch'
import { searchWorlds } from '../../search/worldSearch'
import type { WorldSearchResult } from '../../search/worldSearch'
import styles from './WorldsSpotlight.module.css'

interface WorldsSpotlightProps {
  worlds: readonly World[]
  entryCounts: Record<string, number>
  onClose: () => void
}

function HighlightedTitle({ title, indices }: { title: string; indices: readonly number[] }) {
  const highlighted = new Set(indices)
  return splitGraphemes(title).map((character, index) => (
    highlighted.has(index) ? <mark key={index}>{character}</mark> : character
  ))
}

/** Fuzzy launcher for the Worlds screen — the Worlds-scoped twin of the World's SpotlightSearch. */
export function WorldsSpotlight({ worlds, entryCounts, onClose }: WorldsSpotlightProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const navigate = useNavigate()
  const results = useMemo(() => searchWorlds(query, worlds), [worlds, query])

  useEffect(() => {
    inputRef.current?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)))
  }, [results.length])

  useEffect(() => {
    document.getElementById(`worlds-spotlight-result-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedIndex])

  const openResult = (result: WorldSearchResult) => {
    onClose()
    navigate(`/w/${result.slug}`, { viewTransition: true })
  }

  return (
    <motion.div className={styles.scrim} role="presentation" onMouseDown={onClose} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
      <motion.section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search worlds"
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
            aria-label="Search worlds by name or premise"
            aria-expanded="true"
            aria-controls="worlds-spotlight-results"
            aria-activedescendant={results[selectedIndex] ? `worlds-spotlight-result-${selectedIndex}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Search worlds…"
          />
          <kbd>ESC</kbd>
        </div>
        <div id="worlds-spotlight-results" className={styles.results} role="listbox" aria-label="Search results">
          {results.map((result, index) => {
            const entries = entryCounts[result.slug] ?? 0
            return (
              <button
                key={result.slug}
                id={`worlds-spotlight-result-${index}`}
                type="button"
                className={styles.result}
                role="option"
                aria-selected={index === selectedIndex}
                aria-label={`${result.title}, World`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => openResult(result)}
              >
                <span className={styles.resultIcon} aria-hidden="true"><icons.worlds size={16} /></span>
                <span className={styles.resultCopy}>
                  <strong title={result.title}><HighlightedTitle title={result.title} indices={result.matchIndices} /></strong>
                  <small title={result.logline}>{result.logline}</small>
                </span>
                <span className={styles.resultKind}>{entries} {entries === 1 ? 'entry' : 'entries'}</span>
              </button>
            )
          })}
          {results.length === 0 && <p className={styles.empty}>No worlds match “{query}”.</p>}
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
