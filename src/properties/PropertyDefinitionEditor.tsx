import { CATEGORIES, type Category, type PropertyDef } from '../domain/types'
import styles from './Properties.module.css'

interface PropertyDefinitionEditorProps {
  definition: PropertyDef
  disabled?: boolean
  onChange: (definition: PropertyDef) => void
}

/** Edits the type-specific parts of a page-local Property or Category Template definition. */
export function PropertyDefinitionEditor({ definition, disabled = false, onChange }: PropertyDefinitionEditorProps) {
  if (definition.type === 'select') {
    return (
      <label className={styles.definitionEditor}>
        Options
        <input
          aria-label={`Options for ${definition.label}`}
          disabled={disabled}
          value={(definition.options ?? []).join(', ')}
          onChange={(event) => onChange({
            ...definition,
            options: event.target.value.split(',').map((option) => option.trim()).filter(Boolean),
          })}
        />
      </label>
    )
  }

  if (definition.type === 'relation') {
    const selected = definition.targetCategories ?? []
    return (
      <fieldset className={styles.definitionEditor} disabled={disabled}>
        <legend>Target Categories <small>{selected.length === 0 ? 'Any' : selected.join(', ')}</small></legend>
        <div className={styles.categoryChecks}>
          {CATEGORIES.map((category) => (
            <label key={category}>
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
              {category[0].toUpperCase() + category.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  return null
}
