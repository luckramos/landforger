import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { overlayExitTransition } from '../../components/motionPrefs'
import { useUiStore } from '../../state/uiStore'
import { useNavigate } from 'react-router-dom'
import type { Page } from '../../domain/types'
import type { SpotlightResult } from '../../search/spotlightSearch'
import { searchSpotlight, splitGraphemes } from '../../search/spotlightSearch'
import { icons } from '../../icons'
import { CATEGORY_META, categoryMeta } from './categoryMeta'
import styles from './SpotlightSearch.module.css'

interface SpotlightSearchProps {
  pages: readonly Page[]
  worldSlug: string
  onClose: () => void
}

function HighlightedTitle({ title, indices }: { title: string; indices: readonly number[] }) {
  const highlighted = new Set(indices)
  return splitGraphemes(title).map((character, index) => (
    highlighted.has(index) ? <mark key={index}>{character}</mark> : character
  ))
}

export function SpotlightSearch({ pages, worldSlug, onClose }: SpotlightSearchProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const navigate = useNavigate()
  const results = useMemo(() => searchSpotlight(query, pages, CATEGORY_META), [pages, query])

  useEffect(() => {
    inputRef.current?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)))
  }, [results.length])

  useEffect(() => {
    document.getElementById(`spotlight-result-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedIndex])

  const openResult = (result: SpotlightResult) => {
    onClose()
    navigate(result.kind === 'page' ? `/w/${worldSlug}/p/${result.slug}` : `/w/${worldSlug}/c/${result.category}`)
  }

  return (
    <motion.div className={styles.scrim} role="presentation" onMouseDown={onClose} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
      <motion.section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search the World"
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
            aria-label="Search Pages and Categories"
            aria-expanded="true"
            aria-controls="spotlight-results"
            aria-activedescendant={results[selectedIndex] ? `spotlight-result-${selectedIndex}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Search the world…"
          />
          <kbd>ESC</kbd>
        </div>
        <div id="spotlight-results" className={styles.results} role="listbox" aria-label="Search results">
          {results.map((result, index) => {
            const meta = categoryMeta(result.category)
            return (
              <button
                key={`${result.kind}:${result.kind === 'page' ? result.slug : result.category}`}
                id={`spotlight-result-${index}`}
                type="button"
                className={styles.result}
                role="option"
                aria-selected={index === selectedIndex}
                aria-label={result.kind === 'page' ? `${result.title}, ${meta?.label}` : `${result.title}, Category`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => openResult(result)}
              >
                <span className={styles.resultIcon} style={{ color: `var(--cat-${result.category})` }}>{meta && <meta.icon size={16} />}</span>
                <span className={styles.resultCopy}>
                  <strong><HighlightedTitle title={result.title} indices={result.matchIndices} /></strong>
                  <small>{result.kind === 'page' ? result.summary : 'Category'}</small>
                </span>
                <span className={styles.resultKind}>{result.kind === 'page' ? meta?.label : `${pages.filter((page) => page.category === result.category).length} Pages`}</span>
              </button>
            )
          })}
          {results.length === 0 && <p className={styles.empty}>No Pages or Categories match “{query}”.</p>}
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
