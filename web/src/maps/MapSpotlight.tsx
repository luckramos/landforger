import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Category } from '../domain/types'
import { fuzzyMatch, splitGraphemes } from '../search/spotlightSearch'
import { categoryMeta } from '../screens/Dashboard/categoryMeta'
import { icons } from '../icons'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import styles from './MapSpotlight.module.css'

export interface MapPinItem {
  pinId: string
  title: string
  category: Category
  subtitle: string
}

interface MapSpotlightProps {
  items: readonly MapPinItem[]
  onFocus: (pinId: string) => void
  onClose: () => void
}

function HighlightedTitle({ title, indices }: { title: string; indices: readonly number[] }) {
  const highlighted = new Set(indices)
  return splitGraphemes(title).map((character, index) => (
    highlighted.has(index) ? <mark key={index}>{character}</mark> : character
  ))
}

/** Fuzzy search over the Pins shown on the current Map; selecting one centers and highlights it. */
export function MapSpotlight({ items, onFocus, onClose }: MapSpotlightProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)

  const results = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return items.map((item) => ({ item, indices: [] as number[] }))
    return items
      .map((item) => ({ item, match: fuzzyMatch(item.title, trimmed) }))
      .filter((row): row is { item: MapPinItem; match: NonNullable<typeof row.match> } => row.match !== null)
      .sort((a, b) => b.match.score - a.match.score)
      .map((row) => ({ item: row.item, indices: row.match.indices }))
  }, [items, query])

  useEffect(() => {
    inputRef.current?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)))
  }, [results.length])

  useEffect(() => {
    document.getElementById(`map-result-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedIndex])

  const select = (pinId: string) => {
    onClose()
    onFocus(pinId)
  }

  return (
    <motion.div className={styles.scrim} role="presentation" onMouseDown={onClose} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
      <motion.section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search Pins"
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
            select(results[selectedIndex].item.pinId)
          }
        }}
      >
        <div className={styles.inputRow}>
          <span aria-hidden="true"><icons.search size={16} /></span>
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search Pins on this Map"
            aria-expanded="true"
            aria-controls="map-results"
            aria-activedescendant={results[selectedIndex] ? `map-result-${selectedIndex}` : undefined}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0) }}
            placeholder="Search Pins on this Map…"
          />
          <kbd>ESC</kbd>
        </div>
        <div id="map-results" className={styles.results} role="listbox" aria-label="Search results">
          {results.map(({ item, indices }, index) => {
            const meta = categoryMeta(item.category)
            return (
              <button
                key={item.pinId}
                id={`map-result-${index}`}
                type="button"
                className={styles.result}
                role="option"
                aria-selected={index === selectedIndex}
                aria-label={`${item.title}, ${meta?.label ?? 'Pin'}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => select(item.pinId)}
              >
                <span className={styles.resultIcon} style={{ color: `var(--cat-${item.category})` }}>{meta ? <meta.icon size={16} /> : <icons.marker size={16} />}</span>
                <span className={styles.resultCopy}>
                  <strong title={item.title}><HighlightedTitle title={item.title} indices={indices} /></strong>
                  <small title={item.subtitle}>{item.subtitle}</small>
                </span>
                <span className={styles.resultKind}>Pin</span>
              </button>
            )
          })}
          {results.length === 0 && <p className={styles.empty}>{items.length === 0 ? 'No Pins on this Map yet.' : `No Pins match “${query}”.`}</p>}
        </div>
        <footer className={styles.footer}>
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Focus</span>
          <span><kbd>ESC</kbd> Close</span>
        </footer>
      </motion.section>
    </motion.div>
  )
}
