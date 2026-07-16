// Page metadata caption — the fixed system Properties (Eras, Tags) shown as a
// single line beneath the summary, deliberately formatted apart from the
// custom-property list so the two never read as the same thing. Eras keep
// their Category color + a timeline glyph; Tags read as mono #hashtags.

import { AnimatePresence, motion } from 'motion/react'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import type { Page, World } from '../domain/types'
import { icons } from '../icons'
import { EraPicker, TagPicker } from './MetaPickers'
import styles from './Properties.module.css'

/** Shared pill enter/exit for tag/era chips. */
const chipMotion = {
  layout: true,
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
}

interface PageMetaProps {
  page: Page
  pages: Page[]
  world: World
  readOnly?: boolean
  onTagsChange: (change: (tags: string[]) => string[]) => void
  onErasChange: (change: (eras: string[]) => string[]) => void
  onOpenTag: (tag: string) => void
  onOpenEra: (slug: string) => void
}

export function PageMeta({ page, pages, world, readOnly = false, onTagsChange, onErasChange, onOpenTag, onOpenEra }: PageMetaProps) {
  const motionScale = useUiStore((state) => state.motionScale)

  const eraPages = world.eraOrder
    .map((slug) => pages.find((candidate) => candidate.slug === slug && candidate.category === 'eras'))
    .filter((candidate): candidate is Page => candidate !== undefined)
  const availableEras = eraPages.filter((era) => !page.eras.includes(era.slug))
  const tagSuggestions = [...new Set(pages.flatMap((candidate) => candidate.tags))]
    .filter((tag) => !page.tags.includes(tag))

  // Eras cluster is meaningless on an Era page (it can't sit within itself).
  const showEras = page.category !== 'eras'
  const hasAny = page.tags.length > 0 || (showEras && page.eras.length > 0)
  // Nothing to show and nothing to add — stay out of the reader's way entirely.
  if (readOnly && !hasAny) return null

  return (
    <div className={styles.pageMeta} aria-label="Tags and eras">
      {showEras && (page.eras.length > 0 || !readOnly) && (
        <span className={styles.metaGroup}>
          <span className={styles.metaGlyph} aria-hidden="true"><icons.timeline size={13} /></span>
          <AnimatePresence initial={false}>
            {page.eras.map((slug) => {
              const era = eraPages.find((candidate) => candidate.slug === slug)
              return (
                <motion.span key={slug} className={era ? styles.eraChip : styles.ghostChip} {...chipMotion} transition={overlayExitTransition(motionScale)}>
                  {era
                    ? <button type="button" className={styles.chipNav} aria-label={`Go to ${era.title}`} onClick={() => onOpenEra(era.slug)}>{era.title}</button>
                    : <span className={styles.chipLabel}>{slug}</span>}
                  {!readOnly && <button type="button" className={styles.chipRemove} aria-label={`Remove era ${era?.title ?? slug}`} onClick={() => onErasChange((eras) => eras.filter((item) => item !== slug))}><icons.close size={12} /></button>}
                </motion.span>
              )
            })}
          </AnimatePresence>
          {!readOnly && (
            <EraPicker
              eras={availableEras}
              motionScale={motionScale}
              onAdd={(slug) => onErasChange((eras) => [...eras, slug])}
            />
          )}
        </span>
      )}

      <span className={styles.metaGroup}>
        <AnimatePresence initial={false}>
          {page.tags.map((tag) => (
            <motion.span key={tag} className={styles.tagChip} {...chipMotion} transition={overlayExitTransition(motionScale)}>
              <button type="button" className={styles.chipNav} aria-label={`Open tag ${tag}`} onClick={() => onOpenTag(tag)}>#{tag}</button>
              {!readOnly && <button type="button" className={styles.chipRemove} aria-label={`Remove tag ${tag}`} onClick={() => onTagsChange((tags) => tags.filter((item) => item !== tag))}><icons.close size={12} /></button>}
            </motion.span>
          ))}
        </AnimatePresence>
        {!readOnly && (
          <TagPicker
            suggestions={tagSuggestions}
            motionScale={motionScale}
            onAdd={(tag) => onTagsChange((tags) => (tags.includes(tag) ? tags : [...tags, tag]))}
          />
        )}
      </span>
    </div>
  )
}
