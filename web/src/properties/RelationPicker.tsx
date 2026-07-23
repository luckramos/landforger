import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE_HOUSE, anchoredMenuRowVariants, anchoredMenuVariants, prefersReducedMotion } from '../components/motionPrefs'
import { CATEGORY_META } from '../screens/Dashboard/categoryMeta'
import type { Category, Page } from '../domain/types'
import { icons } from '../icons'
import styles from './Properties.module.css'

interface RelationPickerProps {
  /** Candidate Pages to link — already filtered by target Category and de-duped. */
  targets: Page[]
  label: string
  motionScale: number
  onAdd: (slug: string) => void
}

/**
 * The relation target picker: a `+` trigger opening an anchored popover with a
 * search field and the candidate Pages grouped by Category. Groups start
 * collapsed (a search auto-expands the ones that match), and the popover closes
 * on click-outside, Escape, or picking a Page — the same shape as the app's
 * other anchored menus.
 */
export function RelationPicker({ targets, label, motionScale, onAdd }: RelationPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<Category>>(() => new Set())
  const anchorRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Reset to the collapsed, empty-search state each time it opens; focus search.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setExpanded(new Set())
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Dismiss on outside pointer or Escape, returning focus to the trigger.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const groups = CATEGORY_META.map((meta) => ({
    meta,
    pages: targets.filter(
      (page) => page.category === meta.category && (q === '' || page.title.toLowerCase().includes(q)),
    ),
  })).filter((group) => group.pages.length > 0)

  const toggleGroup = (category: Category) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }
  // A search auto-expands every matching group; otherwise honour the toggle set.
  const groupOpen = (category: Category) => q !== '' || expanded.has(category)

  const add = (slug: string) => {
    onAdd(slug)
    setOpen(false)
  }

  const collapseTransition = prefersReducedMotion()
    ? { duration: 0 }
    : { duration: 0.2 * motionScale, ease: EASE_HOUSE }

  return (
    <span className={styles.chipAnchor} ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.addChip}
        aria-label={`Add ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <icons.add size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.relationPicker}
            role="dialog"
            aria-label={`${label} choices`}
            variants={anchoredMenuVariants(motionScale)}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className={styles.relationSearch}>
              <icons.search size={14} aria-hidden="true" />
              <input
                ref={searchRef}
                className={styles.relationSearchInput}
                aria-label={`Search ${label}`}
                placeholder="Search pages"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className={styles.relationList}>
              {groups.length === 0 ? (
                <p className={styles.empty}>No matching Pages</p>
              ) : (
                groups.map(({ meta, pages }) => {
                  const Icon = meta.icon
                  const isOpen = groupOpen(meta.category)
                  return (
                    <div key={meta.category} className={styles.relationGroup}>
                      <motion.button
                        type="button"
                        className={styles.relationGroupHead}
                        style={{ '--chip-cat': `var(--cat-${meta.category})` } as CSSProperties}
                        aria-label={meta.label}
                        aria-expanded={isOpen}
                        variants={anchoredMenuRowVariants()}
                        onClick={() => toggleGroup(meta.category)}
                      >
                        <Icon size={15} className={styles.relationGroupIcon} aria-hidden="true" />
                        <span className={styles.relationGroupLabel}>{meta.label}</span>
                        <span className={styles.relationGroupCount}>{pages.length}</span>
                        <span className={styles.relationGroupCaret} data-open={isOpen || undefined} aria-hidden="true">
                          <icons.caretDown size={12} />
                        </span>
                      </motion.button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            className={styles.relationGroupBody}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={collapseTransition}
                          >
                            {pages.map((page) => (
                              <button
                                key={page.slug}
                                type="button"
                                className={styles.relationOption}
                                aria-label={page.title}
                                onClick={() => add(page.slug)}
                              >
                                {page.title}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
