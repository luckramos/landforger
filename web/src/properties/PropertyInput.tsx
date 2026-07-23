import { type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import type { CustomProperty, Page } from '../domain/types'
import { icons } from '../icons'
import { ImageInput } from './ImageInput'
import { NumberInput } from './NumberInput'
import { DateInput } from './DateInput'
import { SelectInput } from './SelectInput'
import { RelationPicker } from './RelationPicker'
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
  /** When provided, resolved relation chips become navigable links to their target Page. */
  onOpenPage?: (slug: string) => void
  /**
   * Give the scalar/trigger controls a solid resting surface instead of the
   * inline "transparent-until-hover" panel style. Used by create forms, where
   * a control must read as a filled field. Relation/image keep their own chrome.
   */
  filled?: boolean
}

/** Public form seam shared by inline Page Properties and per-Category create forms. */
export function PropertyInput({ property, pages, disabled = false, onChange, onOpenPage, filled = false }: PropertyInputProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const scalar = Array.isArray(property.value) ? '' : property.value

  // Layout-invisible wrapper (display: contents) — its only job is to scope the
  // filled surface onto the control inside, so nothing renders larger than the
  // control itself.
  const fill = (node: ReactNode) => (filled ? <div className={styles.filledField}>{node}</div> : node)

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
              // Resolved relations carry their target's Category color via --chip-cat.
              const chipStyle = target ? ({ '--chip-cat': `var(--cat-${target.category})` } as CSSProperties) : undefined
              return (
                <motion.span key={slug} className={target ? styles.relationChip : styles.ghostChip} style={chipStyle} {...chipMotion} transition={overlayExitTransition(motionScale)}>
                  {target && onOpenPage
                    ? <button type="button" className={styles.chipNav} aria-label={`Go to ${target.title}`} onClick={() => onOpenPage(target.slug)}>{target.title}</button>
                    : <span className={styles.chipLabel}>{target?.title ?? slug}</span>}
                  {!disabled && (
                    <button type="button" className={styles.chipRemove} aria-label={`Remove ${target?.title ?? slug} from ${property.label}`} onClick={() => onChange(slugs.filter((item) => item !== slug))}><icons.close size={12} /></button>
                  )}
                </motion.span>
              )
            })}
          </AnimatePresence>
          {!disabled && (
            <RelationPicker
              targets={targets}
              label={property.label}
              motionScale={motionScale}
              onAdd={(slug) => onChange([...slugs, slug])}
            />
          )}
        </div>
      </div>
    )
  }

  if (property.type === 'textarea') {
    return fill(<textarea className={styles.textarea} aria-label={property.label} disabled={disabled} value={String(scalar)} onChange={(event) => onChange(event.target.value)} />)
  }

  if (property.type === 'select') {
    return fill(
      <SelectInput
        value={String(scalar)}
        label={property.label}
        options={property.options ?? []}
        disabled={disabled}
        onChange={onChange}
      />,
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
    return fill(<NumberInput value={typeof scalar === 'number' ? scalar : Number(scalar) || 0} label={property.label} disabled={disabled} onChange={onChange} />)
  }

  if (property.type === 'date') {
    return fill(<DateInput value={String(scalar)} label={property.label} disabled={disabled} onChange={onChange} />)
  }

  return fill(
    <input
      className={styles.input}
      aria-label={property.label}
      disabled={disabled}
      type="text"
      value={String(scalar)}
      onChange={(event) => onChange(event.target.value)}
    />,
  )
}
