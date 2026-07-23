import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DIALOG_CHUNK_VARIANTS, dialogChunkTransition, dialogContainerVariants, overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import type { CustomPropertyType, PropertyDef } from '../domain/types'
import { icons } from '../icons'
import { PropertyDefinitionEditor } from './PropertyDefinitionEditor'
import styles from './Properties.module.css'

/** Which Property types carry configurable settings behind the gear. */
export function hasSettings(type: CustomPropertyType): boolean {
  return type === 'select' || type === 'relation' || type === 'image'
}

const cap = (value: string) => value[0].toUpperCase() + value.slice(1)

function settingsTitle(type: CustomPropertyType): string {
  if (type === 'select') return 'Select options'
  if (type === 'image') return 'Image display'
  return 'Relation targets'
}

function summarize(definition: PropertyDef): string {
  if (definition.type === 'select') {
    const count = (definition.options ?? []).length
    return count === 0 ? 'No options yet' : `${count} option${count === 1 ? '' : 's'}`
  }
  if (definition.type === 'image') {
    return `${cap(definition.size ?? 'medium')} · ${cap(definition.orientation ?? 'landscape')}`
  }
  const targets = definition.targetCategories ?? []
  return targets.length === 0
    ? 'Any category'
    : targets.map((category) => cap(category)).join(', ')
}

interface PropertySettingsProps {
  definition: PropertyDef
  onSave: (definition: PropertyDef) => void
}

/**
 * Gear button + anchored popover holding a Property's type-specific settings
 * (a select's options, a relation's target Categories). Edits auto-save: every
 * change commits straight to the Property, so there's no Save/Cancel — the
 * popover just closes on click-outside, Escape, or toggling the gear.
 */
export function PropertySettings({ definition, onSave }: PropertySettingsProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const toggle = () => setOpen((current) => !current)

  // Dismiss on outside pointer or Escape (edits are already saved), returning
  // focus to the gear.
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

  return (
    <div className={styles.settingsAnchor} ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.iconButton}
        aria-label={`Configure ${definition.label}`}
        aria-expanded={open}
        onClick={toggle}
      >
        <icons.settings size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.settingsPanel}
            role="dialog"
            aria-label={`${definition.label} settings`}
            initial="hidden"
            animate="visible"
            variants={dialogContainerVariants(motionScale)}
            exit={{ opacity: 0, transition: overlayExitTransition(motionScale) }}
          >
            <motion.p className={styles.settingsSummary} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
              {settingsTitle(definition.type)}
              <span>{summarize(definition)}</span>
            </motion.p>
            <motion.div variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
              <PropertyDefinitionEditor definition={definition} onChange={onSave} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
