import { useEffect, useState } from 'react'
import { CATEGORIES, type Category, type CustomProperty, type CustomPropertyType, type Page, type PropertyDef, type World } from '../domain/types'
import { propertyFromDefinition, templatePropertiesFor, uniquePropertyKey } from '../domain/properties'
import { PropertyInput } from './PropertyInput'
import { PropertyDefinitionEditor } from './PropertyDefinitionEditor'
import styles from './Properties.module.css'

const PROPERTY_TYPES: CustomPropertyType[] = ['text', 'textarea', 'select', 'relation', 'image', 'number', 'date']

interface PagePropertiesProps {
  page: Page
  pages: Page[]
  world: World
  readOnly?: boolean
  onPropertiesChange: (change: (properties: CustomProperty[]) => CustomProperty[]) => void
  onTagsChange: (change: (tags: string[]) => string[]) => void
  onErasChange: (change: (eras: string[]) => string[]) => void
  onCoverChange: (cover: string | undefined) => void
  onLifecycleChange: (title: string, category: Category, applyTemplate: boolean) => void
  onDelete: () => void
  onTemplateChange: (category: Category, properties: PropertyDef[]) => void
  onSeeTimeline: () => void
}

const typeLabel = (type: CustomPropertyType) => type[0].toUpperCase() + type.slice(1)

export function PageProperties({
  page,
  pages,
  world,
  readOnly = false,
  onPropertiesChange,
  onTagsChange,
  onErasChange,
  onCoverChange,
  onLifecycleChange,
  onDelete,
  onTemplateChange,
  onSeeTimeline,
}: PagePropertiesProps) {
  const [tagOpen, setTagOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [eraOpen, setEraOpen] = useState(false)
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState(page.title)
  const [categoryDraft, setCategoryDraft] = useState<Category>(page.category)
  const [applyTemplate, setApplyTemplate] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateDraft, setTemplateDraft] = useState<PropertyDef[]>([])

  useEffect(() => {
    setTitleDraft(page.title)
    setCategoryDraft(page.category)
  }, [page.slug, page.title, page.category])

  const eraPages = world.eraOrder
    .map((slug) => pages.find((candidate) => candidate.slug === slug && candidate.category === 'eras'))
    .filter((candidate): candidate is Page => candidate !== undefined)
  const knownTags = [...new Set(pages.flatMap((candidate) => candidate.tags))]
    .filter((tag) => !page.tags.includes(tag) && tag.toLocaleLowerCase().includes(tagDraft.trim().toLocaleLowerCase()))
    .sort((a, b) => a.localeCompare(b))

  const updateProperty = (key: string, transform: (property: CustomProperty) => CustomProperty) => {
    onPropertiesChange((properties) => properties.map((property) => property.key === key ? transform(property) : property))
  }

  const addProperty = (type: CustomPropertyType) => {
    onPropertiesChange((properties) => {
      const label = `${typeLabel(type)} property`
      const key = uniquePropertyKey(label, properties.map((property) => property.key))
      return [...properties, propertyFromDefinition({ key, label, type })]
    })
    setTypePickerOpen(false)
  }

  const openTemplate = () => {
    setTemplateDraft(structuredClone(templatePropertiesFor(world, page.category)))
    setTemplateOpen(true)
  }

  const addTemplateProperty = (type: CustomPropertyType) => {
    setTemplateDraft((properties) => {
      const label = `${typeLabel(type)} property`
      return [...properties, { key: uniquePropertyKey(label, properties.map((property) => property.key)), label, type }]
    })
  }

  return (
    <section className={styles.properties} aria-label="Page properties">
      <div className={styles.topActions}>
        {!readOnly && <button type="button" aria-label="Page actions" onClick={() => setActionsOpen((open) => !open)}>•••</button>}
      </div>

      <div className={styles.sharedRow}>
        <span className={styles.label}>Tags</span>
        <div className={styles.chips}>
          {page.tags.map((tag) => <span key={tag} className={styles.tagChip}>#{tag}<button type="button" disabled={readOnly} aria-label={`Remove tag ${tag}`} onClick={() => onTagsChange((tags) => tags.filter((item) => item !== tag))}>×</button></span>)}
          {!readOnly && <button type="button" className={styles.addChip} aria-label="Add tag" onClick={() => setTagOpen((open) => !open)}>＋ tag</button>}
        </div>
        {tagOpen && (
          <div className={styles.inlinePopover}>
            <input aria-label="New tag" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} />
            {knownTags.map((tag) => <button type="button" key={tag} aria-label={`Use tag ${tag}`} onClick={() => { onTagsChange((tags) => [...tags, tag]); setTagDraft(''); setTagOpen(false) }}>#{tag}</button>)}
            <button type="button" aria-label={`Create tag ${tagDraft}`} disabled={!tagDraft.trim()} onClick={() => {
              const tag = tagDraft.trim().replace(/^#/, '')
              onTagsChange((tags) => tags.includes(tag) ? tags : [...tags, tag])
              setTagDraft('')
              setTagOpen(false)
            }}>Add</button>
          </div>
        )}
      </div>

      {page.category !== 'eras' && (
        <div className={styles.sharedRow}>
          <span className={styles.label}>Eras</span>
          <div className={styles.chips}>
            {page.eras.map((slug) => {
              const era = eraPages.find((candidate) => candidate.slug === slug)
              return <span key={slug} className={era ? styles.eraChip : styles.ghostChip}>{era?.title ?? slug}<button type="button" disabled={readOnly} aria-label={`Remove era ${era?.title ?? slug}`} onClick={() => onErasChange((eras) => eras.filter((item) => item !== slug))}>×</button></span>
            })}
            {!readOnly && <button type="button" className={styles.addChip} aria-label="Add era" onClick={() => setEraOpen((open) => !open)}>＋ era</button>}
            {page.eras.length > 0 && <button type="button" className={styles.timelineChip} onClick={onSeeTimeline}>See on timeline →</button>}
          </div>
          {eraOpen && <div className={styles.inlinePopover}>{eraPages.filter((era) => !page.eras.includes(era.slug)).map((era) => <button key={era.slug} type="button" onClick={() => { onErasChange((eras) => [...eras, era.slug]); setEraOpen(false) }}>{era.title}</button>)}</div>}
        </div>
      )}

      <div className={styles.sharedRow}>
        <span className={styles.label}>Cover</span>
        <div className={styles.coverSlot}>
          {page.cover && <img src={page.cover} alt="" />}
          <input aria-label="Cover" disabled={readOnly} type="url" value={page.cover ?? ''} placeholder="Image URL" onChange={(event) => onCoverChange(event.target.value || undefined)} />
        </div>
      </div>

      <div className={styles.propertyRows}>
        {page.customProperties.map((property) => (
          <div className={styles.propertyRow} key={property.key}>
            {readOnly ? <span className={styles.label}>{property.label}</span> : (
              <input
                className={styles.labelInput}
                aria-label={`Property name for ${property.key}`}
                value={property.label}
                onChange={(event) => updateProperty(property.key, (current) => ({ ...current, label: event.target.value }))}
              />
            )}
            <div>
              <PropertyInput property={property} pages={pages.filter((candidate) => candidate.slug !== page.slug)} disabled={readOnly} onChange={(value) => updateProperty(property.key, (current) => ({ ...current, value }))} />
              <PropertyDefinitionEditor definition={property} disabled={readOnly} onChange={(definition) => updateProperty(property.key, (current) => ({ ...current, ...definition }))} />
            </div>
            {!readOnly && <button type="button" className={styles.remove} aria-label={`Remove ${property.label}`} onClick={() => onPropertiesChange((properties) => properties.filter((candidate) => candidate.key !== property.key))}>×</button>}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className={styles.propertyFooter}>
          <button type="button" aria-label="Add property" onClick={() => setTypePickerOpen((open) => !open)}>＋ add property</button>
          <button type="button" aria-label={`Edit ${page.category} template`} onClick={openTemplate}>Edit Category Template</button>
          {typePickerOpen && <div className={styles.typePicker}>{PROPERTY_TYPES.map((type) => <button type="button" key={type} aria-label={`Add ${type} property`} onClick={() => addProperty(type)}>{typeLabel(type)}</button>)}</div>}
        </div>
      )}

      {actionsOpen && (
        <div className={styles.dialog} role="dialog" aria-label="Page lifecycle">
          <h2>Page details</h2>
          <label>Page title<input aria-label="Page title" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} /></label>
          <label>Category<select aria-label="Category" value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value as Category)}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          {categoryDraft !== page.category && <label className={styles.checkbox}><input type="checkbox" aria-label="Apply target Category Template" checked={applyTemplate} onChange={(event) => setApplyTemplate(event.target.checked)} />Apply target Category Template</label>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.danger} onClick={onDelete}>Delete page</button>
            <button type="button" onClick={() => { onLifecycleChange(titleDraft.trim(), categoryDraft, applyTemplate); setActionsOpen(false) }}>Save page details</button>
          </div>
        </div>
      )}

      {templateOpen && (
        <div className={styles.dialog} role="dialog" aria-label={`${page.category} Category Template`}>
          <h2>{page.category} template</h2>
          <p>Changes seed future Pages only.</p>
          {templateDraft.map((definition, index) => (
            <div className={styles.templateRow} key={definition.key}>
              <div>
                <input aria-label={`Template property name for ${definition.key}`} value={definition.label} onChange={(event) => setTemplateDraft((properties) => properties.map((property, propertyIndex) => propertyIndex === index ? { ...property, label: event.target.value } : property))} />
                <PropertyDefinitionEditor definition={definition} onChange={(changed) => setTemplateDraft((properties) => properties.map((property, propertyIndex) => propertyIndex === index ? changed : property))} />
              </div>
              <span>{definition.type}</span>
              <button type="button" aria-label={`Remove ${definition.label} from template`} onClick={() => setTemplateDraft((properties) => properties.filter((_, propertyIndex) => propertyIndex !== index))}>×</button>
            </div>
          ))}
          <div className={styles.typePicker}>{PROPERTY_TYPES.map((type) => <button type="button" key={type} aria-label={`Add ${type} to template`} onClick={() => addTemplateProperty(type)}>{typeLabel(type)}</button>)}</div>
          <div className={styles.dialogActions}><button type="button" onClick={() => setTemplateOpen(false)}>Cancel</button><button type="button" onClick={() => { onTemplateChange(page.category, templateDraft); setTemplateOpen(false) }}>Save Category Template</button></div>
        </div>
      )}
    </section>
  )
}
