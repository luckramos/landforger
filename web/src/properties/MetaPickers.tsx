import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { anchoredMenuRowVariants, anchoredMenuVariants } from '../components/motionPrefs'
import type { Page } from '../domain/types'
import { icons } from '../icons'
import styles from './Properties.module.css'

/**
 * Shared open-state + dismissal for the Eras / Tags add popovers: closes on an
 * outside pointer or Escape (returning focus to the trigger), mirroring the
 * app's other anchored menus.
 */
function useDismissablePopover() {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

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

  return { open, setOpen, anchorRef, triggerRef }
}

interface EraPickerProps {
  /** Era Pages not yet on this Page, in world order. */
  eras: Page[]
  motionScale: number
  onAdd: (slug: string) => void
}

/** "+ era" trigger → anchored menu of the remaining Eras. */
export function EraPicker({ eras, motionScale, onAdd }: EraPickerProps) {
  const { open, setOpen, anchorRef, triggerRef } = useDismissablePopover()

  const add = (slug: string) => {
    onAdd(slug)
    setOpen(false)
  }

  return (
    <span className={styles.chipAnchor} ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.addChip}
        aria-label="Add era"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <icons.add size={14} /> era
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.metaMenu}
            role="menu"
            aria-label="Add era"
            variants={anchoredMenuVariants(motionScale)}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className={styles.metaList}>
              {eras.length === 0 ? (
                <p className={styles.empty}>No eras left to add</p>
              ) : (
                eras.map((era) => (
                  <motion.button
                    key={era.slug}
                    type="button"
                    className={styles.metaOption}
                    aria-label={era.title}
                    variants={anchoredMenuRowVariants()}
                    onClick={() => add(era.slug)}
                  >
                    <span className={styles.metaOptionGlyph} aria-hidden="true"><icons.timeline size={13} /></span>
                    {era.title}
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

interface TagPickerProps {
  /** World tags not already on this Page (unfiltered; the picker searches them). */
  suggestions: string[]
  motionScale: number
  onAdd: (tag: string) => void
}

/** "+ tag" trigger → search field (type to filter or create) over the World's tags. */
export function TagPicker({ suggestions, motionScale, onAdd }: TagPickerProps) {
  const { open, setOpen, anchorRef, triggerRef } = useDismissablePopover()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft('')
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  const query = draft.trim().toLocaleLowerCase()
  const clean = draft.trim().replace(/^#/, '')
  const matches = suggestions
    .filter((tag) => tag.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.localeCompare(b))
  const exactMatch = suggestions.find((tag) => tag.toLocaleLowerCase() === clean.toLocaleLowerCase())
  const canCreate = clean !== '' && exactMatch === undefined

  const use = (tag: string) => {
    onAdd(tag)
    setDraft('')
    setOpen(false)
  }
  const create = () => {
    if (clean === '') return
    use(clean)
  }
  const commit = () => {
    if (exactMatch) use(exactMatch)
    else if (canCreate) create()
  }

  return (
    <span className={styles.chipAnchor} ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.addChip}
        aria-label="Add tag"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <icons.add size={14} /> tag
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.metaMenu}
            role="dialog"
            aria-label="Add tag"
            variants={anchoredMenuVariants(motionScale)}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className={styles.tagSearch}>
              <span className={styles.tagSearchHash} aria-hidden="true">#</span>
              <input
                ref={inputRef}
                className={styles.tagSearchInput}
                aria-label="New tag"
                placeholder="Find or create"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commit()
                  }
                }}
              />
            </div>
            <div className={styles.metaList}>
              {matches.map((tag) => (
                <motion.button
                  key={tag}
                  type="button"
                  className={styles.metaOption}
                  aria-label={`Use tag ${tag}`}
                  variants={anchoredMenuRowVariants()}
                  onClick={() => use(tag)}
                >
                  <span className={styles.tagHash} aria-hidden="true">#</span>{tag}
                </motion.button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  className={styles.metaCreate}
                  aria-label={`Create tag ${clean}`}
                  onClick={create}
                >
                  <icons.add size={13} /> Create <span className={styles.tagHash}>#</span>{clean}
                </button>
              )}
              {matches.length === 0 && !canCreate && <p className={styles.empty}>No tags yet</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
