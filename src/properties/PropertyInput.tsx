import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import type { CustomProperty, Page } from '../domain/types'
import { icons } from '../icons'
import { ImageInput } from './ImageInput'
import { NumberInput } from './NumberInput'
import { DateInput } from './DateInput'
import styles from './Properties.module.css'

/** Shared pill enter/exit for chips that can be added and removed. */
const chipMotion = {
  layout: true,
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
}

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
          <AnimatePresence initial={false}>
            {slugs.map((slug) => {
              const target = pages.find((candidate) => candidate.slug === slug)
              return (
                <motion.span key={slug} className={target ? styles.relationChip : styles.ghostChip} {...chipMotion} transition={overlayExitTransition(motionScale)}>
                  <span className={styles.chipLabel}>{target?.title ?? slug}</span>
                  {!disabled && (
                    <button type="button" className={styles.chipRemove} aria-label={`Remove ${target?.title ?? slug} from ${property.label}`} onClick={() => onChange(slugs.filter((item) => item !== slug))}><icons.close size={12} /></button>
                  )}
                </motion.span>
              )
            })}
          </AnimatePresence>
          {!disabled && (
            <span className={styles.chipAnchor}>
              <button type="button" className={styles.addChip} aria-label={`Add ${property.label}`} aria-expanded={pickerOpen} onClick={() => setPickerOpen((open) => !open)}><icons.add size={14} /></button>
              <AnimatePresence>
                {pickerOpen && (
                  <motion.div className={styles.dropdown} aria-label={`${property.label} choices`} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
                    {targets.length > 0 ? targets.map((target) => (
                      <button key={target.slug} type="button" aria-label={target.title} onClick={() => { onChange([...slugs, target.slug]); setPickerOpen(false) }}>
                        <span style={{ color: `var(--cat-${target.category})` }}><icons.circle size={10} weight="fill" /></span>{target.title}
                      </button>
                    )) : <span className={styles.empty}>No matching Pages</span>}
                  </motion.div>
                )}
              </AnimatePresence>
            </span>
          )}
        </div>
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

  if (property.type === 'image') {
    return (
      <ImageInput
        value={String(scalar)}
        label={property.label}
        disabled={disabled}
        size={property.size}
        orientation={property.orientation}
        onChange={(value) => onChange(value ?? '')}
      />
    )
  }

  if (property.type === 'number') {
    return <NumberInput value={typeof scalar === 'number' ? scalar : Number(scalar) || 0} label={property.label} disabled={disabled} onChange={onChange} />
  }

  if (property.type === 'date') {
    return <DateInput value={String(scalar)} label={property.label} disabled={disabled} onChange={onChange} />
  }

  return (
    <input
      className={styles.input}
      aria-label={property.label}
      disabled={disabled}
      type="text"
      value={String(scalar)}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
