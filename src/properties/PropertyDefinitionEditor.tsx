import { useState } from 'react'
import { CATEGORIES, type Category, type ImageOrientation, type ImageSize, type PropertyDef } from '../domain/types'
import { icons } from '../icons'
import styles from './Properties.module.css'

const cap = (value: string) => value[0].toUpperCase() + value.slice(1)
const IMAGE_SIZES: ImageSize[] = ['small', 'medium', 'large']
const IMAGE_ORIENTATIONS: ImageOrientation[] = ['landscape', 'portrait']

interface PropertyDefinitionEditorProps {
  definition: PropertyDef
  disabled?: boolean
  onChange: (definition: PropertyDef) => void
}

/**
 * Edits the type-specific parts of a page-local Property or Category Template
 * definition. Every type lays its controls out as the same field shape — an
 * eyebrow label, the control, then an optional hint — so the gear popover and
 * the template dialog read consistently across select / relation / image.
 */
export function PropertyDefinitionEditor({ definition, disabled = false, onChange }: PropertyDefinitionEditorProps) {
  if (definition.type === 'select') {
    return <SelectOptionsEditor definition={definition} disabled={disabled} onChange={onChange} />
  }

  if (definition.type === 'relation') {
    const selected = definition.targetCategories ?? []
    return (
      <fieldset className={styles.definitionEditor} disabled={disabled}>
        <div className={styles.settingsField}>
          <span className={styles.settingsFieldLabel}>Target categories</span>
          <div className={styles.categoryChecks}>
            {CATEGORIES.map((category) => (
              <label key={category} className={styles.categoryChip}>
                <input
                  type="checkbox"
                  aria-label={`Target ${category} for ${definition.label}`}
                  checked={selected.includes(category)}
                  onChange={(event) => {
                    const targetCategories: Category[] = event.target.checked
                      ? [...selected, category]
                      : selected.filter((candidate) => candidate !== category)
                    onChange({ ...definition, ...(targetCategories.length > 0 ? { targetCategories } : { targetCategories: undefined }) })
                  }}
                />
                {cap(category)}
              </label>
            ))}
          </div>
          <p className={styles.settingsHint}>Leave all off to allow any category.</p>
        </div>
      </fieldset>
    )
  }

  if (definition.type === 'image') {
    const size = definition.size ?? 'medium'
    const orientation = definition.orientation ?? 'landscape'
    return (
      <div className={styles.definitionEditor}>
        <div className={styles.settingsField}>
          <div className={styles.segChoiceRow}>
            <span className={styles.settingsFieldLabel}>Size</span>
            <div className={styles.segChoice}>
              {IMAGE_SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  aria-label={`${cap(option)} size for ${definition.label}`}
                  aria-pressed={size === option}
                  data-active={size === option || undefined}
                  onClick={() => onChange({ ...definition, size: option })}
                >
                  {cap(option)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.segChoiceRow}>
            <span className={styles.settingsFieldLabel}>Orientation</span>
            <div className={styles.segChoice}>
              {IMAGE_ORIENTATIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  aria-label={`${cap(option)} orientation for ${definition.label}`}
                  aria-pressed={orientation === option}
                  data-active={orientation === option || undefined}
                  onClick={() => onChange({ ...definition, orientation: option })}
                >
                  {cap(option)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

/**
 * A Select's option list, edited as pills: type a choice and press Enter to
 * add it, click a pill's × (or Backspace on the empty field) to remove it.
 * The draft text is component-local; only the committed pills live in the
 * definition.
 */
function SelectOptionsEditor({ definition, disabled, onChange }: { definition: PropertyDef; disabled: boolean; onChange: (definition: PropertyDef) => void }) {
  const options = definition.options ?? []
  const [draft, setDraft] = useState('')

  const addOption = (raw: string) => {
    const value = raw.trim()
    setDraft('')
    if (value === '' || options.includes(value)) return
    onChange({ ...definition, options: [...options, value] })
  }

  const removeOption = (option: string) => {
    onChange({ ...definition, options: options.filter((candidate) => candidate !== option) })
  }

  return (
    <div className={styles.definitionEditor}>
      <div className={styles.settingsField}>
        <span className={styles.settingsFieldLabel}>Options</span>
        {options.length > 0 && (
          <div className={styles.optionPills}>
            {options.map((option) => (
              <span key={option} className={styles.optionPill}>
                {option}
                {!disabled && (
                  <button
                    type="button"
                    className={styles.optionPillRemove}
                    aria-label={`Remove option ${option}`}
                    onClick={() => removeOption(option)}
                  >
                    <icons.close size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <input
          className={styles.settingsInput}
          aria-label={`Options for ${definition.label}`}
          disabled={disabled}
          value={draft}
          placeholder="Type an option, press Enter"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addOption(event.currentTarget.value)
            } else if (event.key === 'Backspace' && event.currentTarget.value === '' && options.length > 0) {
              event.preventDefault()
              removeOption(options[options.length - 1])
            }
          }}
        />
        <p className={styles.settingsHint}>Press Enter to add each option.</p>
      </div>
    </div>
  )
}
