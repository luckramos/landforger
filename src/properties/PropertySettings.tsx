import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { overlayExitTransition } from '../components/motionPrefs'
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
 * (a select's options, a relation's target Categories). Edits are held in a
 * draft and only committed on Save, so the popover can be dismissed without
 * changing the Property.
 */
export function PropertySettings({ definition, onSave }: PropertySettingsProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<PropertyDef>(definition)

  const toggle = () => {
    if (open) { setOpen(false); return }
    setDraft(definition)
    setOpen(true)
  }

  const save = () => {
    onSave(draft)
    setOpen(false)
  }

  return (
    <div className={styles.settingsAnchor}>
      <button
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
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayExitTransition(motionScale)}
          >
            <p className={styles.settingsSummary}>
              {settingsTitle(definition.type)}
              <span>{summarize(draft)}</span>
            </p>
            <PropertyDefinitionEditor definition={draft} onChange={setDraft} />
            <div className={styles.settingsActions}>
              <button type="button" className={styles.tintButton} aria-label="Cancel settings" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className={styles.tintPrimary} aria-label={`Save ${definition.label} settings`} onClick={save}>Save</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
