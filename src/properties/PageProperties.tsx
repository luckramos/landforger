import { useEffect, useState } from 'react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import { CATEGORIES, type Category, type CustomProperty, type CustomPropertyType, type CustomPropertyValue, type Page, type PropertyDef, type World } from '../domain/types'
import { propertyFromDefinition, templatePropertiesFor, uniquePropertyKey } from '../domain/properties'
import { icons } from '../icons'
import { PropertyInput } from './PropertyInput'
import { PropertyDefinitionEditor } from './PropertyDefinitionEditor'
import { PropertySettings, hasSettings } from './PropertySettings'
import styles from './Properties.module.css'

const PROPERTY_TYPES: CustomPropertyType[] = ['text', 'textarea', 'select', 'relation', 'image', 'number', 'date']

/** Shared pill enter/exit for tag/era chips. */
const chipMotion = {
  layout: true,
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
}

interface PagePropertiesProps {
  page: Page
  pages: Page[]
  world: World
  readOnly?: boolean
  onPropertiesChange: (change: (properties: CustomProperty[]) => CustomProperty[]) => void
  onTagsChange: (change: (tags: string[]) => string[]) => void
  onErasChange: (change: (eras: string[]) => string[]) => void
  onLifecycleChange: (title: string, category: Category, applyTemplate: boolean) => void
  onDelete: () => void
  onTemplateChange: (category: Category, properties: PropertyDef[]) => void
  onOpenTag: (tag: string) => void
  onOpenEra: (slug: string) => void
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
  onLifecycleChange,
  onDelete,
  onTemplateChange,
  onOpenTag,
  onOpenEra,
}: PagePropertiesProps) {
  const motionScale = useUiStore((state) => state.motionScale)
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
        {!readOnly && <button type="button" aria-label="Page actions" onClick={() => setActionsOpen((open) => !open)}><icons.moreHorizontal /></button>}
      </div>

      <div className={styles.sharedRow}>
        <span className={styles.label}>Tags</span>
        <div className={styles.chips}>
          <AnimatePresence initial={false}>
            {page.tags.map((tag) => (
              <motion.span key={tag} className={styles.tagChip} {...chipMotion} transition={overlayExitTransition(motionScale)}>
                <button type="button" className={styles.chipNav} aria-label={`Open tag ${tag}`} onClick={() => onOpenTag(tag)}>#{tag}</button>
                {!readOnly && <button type="button" className={styles.chipRemove} aria-label={`Remove tag ${tag}`} onClick={() => onTagsChange((tags) => tags.filter((item) => item !== tag))}><icons.close size={12} /></button>}
              </motion.span>
            ))}
          </AnimatePresence>
          {!readOnly && (
            <span className={styles.chipAnchor}>
              <button type="button" className={styles.addChip} aria-label="Add tag" aria-expanded={tagOpen} onClick={() => setTagOpen((open) => !open)}><icons.add size={14} /> tag</button>
              <AnimatePresence>
                {tagOpen && (
                  <motion.div className={styles.dropdown} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
                    <input aria-label="New tag" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} />
                    {knownTags.map((tag) => <button type="button" key={tag} aria-label={`Use tag ${tag}`} onClick={() => { onTagsChange((tags) => [...tags, tag]); setTagDraft(''); setTagOpen(false) }}>#{tag}</button>)}
                    <button type="button" aria-label={`Create tag ${tagDraft}`} disabled={!tagDraft.trim()} onClick={() => {
                      const tag = tagDraft.trim().replace(/^#/, '')
                      onTagsChange((tags) => tags.includes(tag) ? tags : [...tags, tag])
                      setTagDraft('')
                      setTagOpen(false)
                    }}>Add</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </span>
          )}
        </div>
      </div>

      {page.category !== 'eras' && (
        <div className={styles.sharedRow}>
          <span className={styles.label}>Eras</span>
          <div className={styles.chips}>
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
              <span className={styles.chipAnchor}>
                <button type="button" className={styles.addChip} aria-label="Add era" aria-expanded={eraOpen} onClick={() => setEraOpen((open) => !open)}><icons.add size={14} /> era</button>
                <AnimatePresence>
                  {eraOpen && (
                    <motion.div className={styles.dropdown} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>
                      {eraPages.filter((era) => !page.eras.includes(era.slug)).map((era) => <button key={era.slug} type="button" onClick={() => { onErasChange((eras) => [...eras, era.slug]); setEraOpen(false) }}>{era.title}</button>)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </span>
            )}
          </div>
        </div>
      )}

      {readOnly ? (
        page.customProperties.length > 0 && (
          <div className={styles.propertyRows}>
            {page.customProperties.map((property) => (
              <div className={`${styles.propertyRow} ${styles.propertyRowStatic}`} key={property.key}>
                <span className={styles.label}>{property.label}</span>
                <div><PropertyInput property={property} pages={pages.filter((candidate) => candidate.slug !== page.slug)} disabled onChange={() => {}} /></div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <Reorder.Group
            as="div"
            axis="y"
            className={styles.propertyRows}
            values={page.customProperties}
            onReorder={(next) => onPropertiesChange(() => next)}
          >
            <AnimatePresence initial={false}>
              {page.customProperties.map((property) => (
                <CustomPropertyRow
                  key={property.key}
                  property={property}
                  pages={pages.filter((candidate) => candidate.slug !== page.slug)}
                  onRename={(label) => updateProperty(property.key, (current) => ({ ...current, label }))}
                  onValueChange={(value) => updateProperty(property.key, (current) => ({ ...current, value }))}
                  onSettingsSave={(definition) => updateProperty(property.key, (current) => ({ ...current, options: definition.options, targetCategories: definition.targetCategories, size: definition.size, orientation: definition.orientation }))}
                  onRemove={() => onPropertiesChange((properties) => properties.filter((candidate) => candidate.key !== property.key))}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>

          <div className={styles.addRow}>
            <button type="button" className={styles.addCard} aria-label="Add property" aria-expanded={typePickerOpen} onClick={() => setTypePickerOpen((open) => !open)}>
              <icons.add size={15} /> Add property
            </button>
            <AnimatePresence>{typePickerOpen && <motion.div className={styles.typePicker} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)}>{PROPERTY_TYPES.map((type) => <button type="button" key={type} aria-label={`Add ${type} property`} onClick={() => addProperty(type)}>{typeLabel(type)}</button>)}</motion.div>}</AnimatePresence>
          </div>
        </>
      )}

      <AnimatePresence>
      {actionsOpen && (
        <motion.div className={styles.dialogScrim} role="presentation" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)} onClick={() => setActionsOpen(false)}>
        <motion.div className={styles.dialog} role="dialog" aria-label="Page lifecycle" initial={false} exit={{ opacity: 0, y: 6, scale: 0.985 }} transition={overlayExitTransition(motionScale)} onClick={(event) => event.stopPropagation()}>
          <h2>Page details</h2>
          <label>Page title<input aria-label="Page title" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} /></label>
          <label>Category<select aria-label="Category" value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value as Category)}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          {categoryDraft !== page.category && <label className={styles.checkbox}><input type="checkbox" aria-label="Apply target Category Template" checked={applyTemplate} onChange={(event) => setApplyTemplate(event.target.checked)} />Apply target Category Template</label>}
          <button type="button" className={styles.templateLink} aria-label={`Edit ${page.category} template`} onClick={() => { setActionsOpen(false); openTemplate() }}><icons.settings size={13} /> Edit Category Template</button>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.danger} onClick={onDelete}>Delete page</button>
            <button type="button" className={styles.tintPrimary} onClick={() => { onLifecycleChange(titleDraft.trim(), categoryDraft, applyTemplate); setActionsOpen(false) }}>Save page details</button>
          </div>
        </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {templateOpen && (
        <motion.div className={styles.dialogScrim} role="presentation" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)} onClick={() => setTemplateOpen(false)}>
        <motion.div className={styles.dialog} role="dialog" aria-label={`${page.category} Category Template`} initial={false} exit={{ opacity: 0, y: 6, scale: 0.985 }} transition={overlayExitTransition(motionScale)} onClick={(event) => event.stopPropagation()}>
          <h2>{page.category} template</h2>
          <p>Changes seed future Pages only.</p>
          {templateDraft.map((definition, index) => (
            <div className={styles.templateRow} key={definition.key}>
              <div>
                <input aria-label={`Template property name for ${definition.key}`} value={definition.label} onChange={(event) => setTemplateDraft((properties) => properties.map((property, propertyIndex) => propertyIndex === index ? { ...property, label: event.target.value } : property))} />
                <PropertyDefinitionEditor definition={definition} onChange={(changed) => setTemplateDraft((properties) => properties.map((property, propertyIndex) => propertyIndex === index ? changed : property))} />
              </div>
              <span>{definition.type}</span>
              <button type="button" aria-label={`Remove ${definition.label} from template`} onClick={() => setTemplateDraft((properties) => properties.filter((_, propertyIndex) => propertyIndex !== index))}><icons.close size={12} /></button>
            </div>
          ))}
          <div className={styles.typePickerInline}>{PROPERTY_TYPES.map((type) => <button type="button" key={type} aria-label={`Add ${type} to template`} onClick={() => addTemplateProperty(type)}>{typeLabel(type)}</button>)}</div>
          <div className={styles.dialogActions}><button type="button" className={styles.tintButton} onClick={() => setTemplateOpen(false)}>Cancel</button><button type="button" className={styles.tintPrimary} onClick={() => { onTemplateChange(page.category, templateDraft); setTemplateOpen(false) }}>Save Category Template</button></div>
        </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </section>
  )
}

interface CustomPropertyRowProps {
  property: CustomProperty
  pages: Page[]
  onRename: (label: string) => void
  onValueChange: (value: CustomPropertyValue) => void
  onSettingsSave: (definition: PropertyDef) => void
  onRemove: () => void
}

/** A draggable Custom Property row: grip handle reorders, the rest edits in place. */
function CustomPropertyRow({ property, pages, onRename, onValueChange, onSettingsSave, onRemove }: CustomPropertyRowProps) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      as="div"
      value={property}
      className={`${styles.propertyRow} ${styles.propertyRowDraggable}`}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileDrag={{ scale: 1.012, boxShadow: '0 14px 34px rgba(0, 0, 0, 0.45)' }}
      transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.6 }}
    >
      <button
        type="button"
        className={styles.dragHandle}
        aria-label={`Reorder ${property.label}`}
        onPointerDown={(event) => controls.start(event)}
      >
        <icons.grip size={14} />
      </button>
      <input
        className={styles.labelInput}
        aria-label={`Property name for ${property.key}`}
        value={property.label}
        onChange={(event) => onRename(event.target.value)}
      />
      <div>
        <PropertyInput property={property} pages={pages} onChange={onValueChange} />
      </div>
      <div className={styles.rowActions}>
        {hasSettings(property.type) && <PropertySettings definition={property} onSave={onSettingsSave} />}
        <button type="button" className={styles.iconButton} aria-label={`Remove ${property.label}`} onClick={onRemove}><icons.close size={14} /></button>
      </div>
    </Reorder.Item>
  )
}
