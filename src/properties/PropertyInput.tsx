import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import type { CustomProperty, Page } from '../domain/types'
import styles from './Properties.module.css'

interface PropertyInputProps {
  property: CustomProperty
  pages: Page[]
  disabled?: boolean
  onChange: (value: CustomProperty['value']) => void
}

/** Public form seam shared by inline Page Properties and per-Category create forms. */
export function PropertyInput({ property, pages, disabled = false, onChange }: PropertyInputProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [pickerOpen, setPickerOpen] = useState(false)
  const scalar = Array.isArray(property.value) ? '' : property.value

  if (property.type === 'relation') {
    const slugs = Array.isArray(property.value) ? property.value : []
    const targets = pages.filter(
      (candidate) =>
        candidate.slug !== undefined &&
        !slugs.includes(candidate.slug) &&
        (!property.targetCategories || property.targetCategories.includes(candidate.category)),
    )
    return (
      <div className={styles.relation} role="group" aria-label={property.label}>
        <div className={styles.chips}>
          {slugs.map((slug) => {
            const target = pages.find((candidate) => candidate.slug === slug)
            return (
              <span key={slug} className={target ? styles.relationChip : styles.ghostChip}>
                {target?.title ?? slug}
                {!disabled && (
                  <button type="button" aria-label={`Remove ${target?.title ?? slug} from ${property.label}`} onClick={() => onChange(slugs.filter((item) => item !== slug))}>×</button>
                )}
              </span>
            )
          })}
          {!disabled && <button type="button" className={styles.addChip} aria-label={`Add ${property.label}`} onClick={() => setPickerOpen((open) => !open)}>＋</button>}
        </div>
        <AnimatePresence>
        {pickerOpen && (
          <motion.div className={styles.popover} aria-label={`${property.label} choices`} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
            {targets.length > 0 ? targets.map((target) => (
              <button key={target.slug} type="button" aria-label={target.title} onClick={() => { onChange([...slugs, target.slug]); setPickerOpen(false) }}>
                <span style={{ color: `var(--cat-${target.category})` }}>●</span>{target.title}
              </button>
            )) : <span className={styles.empty}>No matching Pages</span>}
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    )
  }

  if (property.type === 'textarea') {
    return <textarea className={styles.textarea} aria-label={property.label} disabled={disabled} value={String(scalar)} onChange={(event) => onChange(event.target.value)} />
  }

  if (property.type === 'select') {
    return (
      <select className={styles.input} aria-label={property.label} disabled={disabled} value={String(scalar)} onChange={(event) => onChange(event.target.value)}>
        <option value="">—</option>
        {(property.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }

  return (
    <div className={property.type === 'image' ? styles.imageField : undefined}>
      {property.type === 'image' && scalar !== '' && <img src={String(scalar)} alt="" className={styles.imagePreview} />}
      <input
        className={styles.input}
        aria-label={property.label}
        disabled={disabled}
        type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'image' ? 'url' : 'text'}
        value={scalar}
        onChange={(event) => onChange(property.type === 'number' ? event.target.valueAsNumber || 0 : event.target.value)}
      />
    </div>
  )
}
