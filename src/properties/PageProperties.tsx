import { useEffect, useState } from 'react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react'
import { Checkbox } from '../components/Checkbox/Checkbox'
import { DIALOG_CHUNK_VARIANTS, dialogChunkTransition, dialogContainerVariants, overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import { CATEGORIES, type Category, type CustomProperty, type CustomPropertyType, type CustomPropertyValue, type Page, type PropertyDef, type World } from '../domain/types'
import { propertyFromDefinition, templatePropertiesFor, uniquePropertyKey } from '../domain/properties'
import { icons } from '../icons'
import { PropertyInput } from './PropertyInput'
import { PropertyDefinitionEditor } from './PropertyDefinitionEditor'
import { PropertySettings, hasSettings } from './PropertySettings'
import { PropertyTypeMenu } from './PropertyTypeMenu'
import styles from './Properties.module.css'

interface PagePropertiesProps {
  page: Page
  pages: Page[]
  world: World
  readOnly?: boolean
  onPropertiesChange: (change: (properties: CustomProperty[]) => CustomProperty[]) => void
  onLifecycleChange: (title: string, category: Category, applyTemplate: boolean) => void
  onDelete: () => void
  onTemplateChange: (category: Category, properties: PropertyDef[]) => void
  /** Navigate to a relation target's Page. */
  onOpenPage: (slug: string) => void
}

const typeLabel = (type: CustomPropertyType) => type[0].toUpperCase() + type.slice(1)

export function PageProperties({
  page,
  pages,
  world,
  readOnly = false,
  onPropertiesChange,
  onLifecycleChange,
  onDelete,
  onTemplateChange,
  onOpenPage,
}: PagePropertiesProps) {
  const motionScale = useUiStore((state) => state.motionScale)
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

  const updateProperty = (key: string, transform: (property: CustomProperty) => CustomProperty) => {
    onPropertiesChange((properties) => properties.map((property) => property.key === key ? transform(property) : property))
  }

  const addProperty = (type: CustomPropertyType) => {
    onPropertiesChange((properties) => {
      const label = `${typeLabel(type)} property`
      const key = uniquePropertyKey(label, properties.map((property) => property.key))
      return [...properties, propertyFromDefinition({ key, label, type })]
    })
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

      {readOnly ? (
        page.customProperties.length > 0 && (
          <div className={styles.propertyRows}>
            {page.customProperties.map((property) => (
              <div className={`${styles.propertyRow} ${styles.propertyRowStatic}`} key={property.key}>
                <span className={styles.label}>{property.label}</span>
                <div><PropertyInput property={property} pages={pages.filter((candidate) => candidate.slug !== page.slug)} disabled onChange={() => {}} onOpenPage={onOpenPage} /></div>
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
                  onOpenPage={onOpenPage}
                  onRename={(label) => updateProperty(property.key, (current) => ({ ...current, label }))}
                  onValueChange={(value) => updateProperty(property.key, (current) => ({ ...current, value }))}
                  onSettingsSave={(definition) => updateProperty(property.key, (current) => ({ ...current, options: definition.options, targetCategories: definition.targetCategories, size: definition.size, orientation: definition.orientation }))}
                  onRemove={() => onPropertiesChange((properties) => properties.filter((candidate) => candidate.key !== property.key))}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>

          <div className={styles.addRow}>
            <PropertyTypeMenu
              motionScale={motionScale}
              onSelect={addProperty}
              itemLabel={(type) => `Add ${type} property`}
              triggerLabel="Add property"
            />
          </div>
        </>
      )}

      <AnimatePresence>
      {actionsOpen && (
        <motion.div className={styles.dialogScrim} role="presentation" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)} onClick={() => setActionsOpen(false)}>
        <motion.div
          className={styles.dialog}
          role="dialog"
          aria-label="Page lifecycle"
          initial="hidden"
          animate="visible"
          variants={dialogContainerVariants(motionScale)}
          exit={{ opacity: 0, y: 6, scale: 0.985, transition: overlayExitTransition(motionScale) }}
          onClick={(event) => event.stopPropagation()}
        >
          <motion.h2 variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>Page details</motion.h2>
          <motion.div className={styles.dialogFields} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
            <label>Page title<input aria-label="Page title" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} /></label>
            <label>Category<select aria-label="Category" value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value as Category)}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            {categoryDraft !== page.category && <Checkbox className={styles.checkbox} aria-label="Apply target Category Template" checked={applyTemplate} onChange={(event) => setApplyTemplate(event.target.checked)}>Apply target Category Template</Checkbox>}
            <button type="button" className={styles.templateLink} aria-label={`Edit ${page.category} template`} onClick={() => { setActionsOpen(false); openTemplate() }}><icons.settings size={13} /> Edit Category Template</button>
          </motion.div>
          <motion.div className={styles.dialogActions} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
            <button type="button" className={styles.danger} onClick={onDelete}>Delete page</button>
            <button type="button" className={styles.tintPrimary} onClick={() => { onLifecycleChange(titleDraft.trim(), categoryDraft, applyTemplate); setActionsOpen(false) }}>Save page details</button>
          </motion.div>
        </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {templateOpen && (
        <motion.div className={styles.dialogScrim} role="presentation" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={overlayExitTransition(motionScale)} onClick={() => setTemplateOpen(false)}>
        <motion.div
          className={styles.dialog}
          role="dialog"
          aria-label={`${page.category} Category Template`}
          initial="hidden"
          animate="visible"
          variants={dialogContainerVariants(motionScale)}
          exit={{ opacity: 0, y: 6, scale: 0.985, transition: overlayExitTransition(motionScale) }}
          onClick={(event) => event.stopPropagation()}
        >
          <motion.div variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
            <h2>{page.category} template</h2>
            <p>Changes seed future Pages only.</p>
          </motion.div>
          <motion.div className={styles.dialogFields} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
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
            <PropertyTypeMenu
              variant="inline"
              motionScale={motionScale}
              onSelect={addTemplateProperty}
              itemLabel={(type) => `Add ${type} to template`}
            />
          </motion.div>
          <motion.div className={styles.dialogActions} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
            <button type="button" className={styles.tintButton} onClick={() => setTemplateOpen(false)}>Cancel</button>
            <button type="button" className={styles.tintPrimary} onClick={() => { onTemplateChange(page.category, templateDraft); setTemplateOpen(false) }}>Save Category Template</button>
          </motion.div>
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
  onOpenPage: (slug: string) => void
  onRename: (label: string) => void
  onValueChange: (value: CustomPropertyValue) => void
  onSettingsSave: (definition: PropertyDef) => void
  onRemove: () => void
}

/** A draggable Custom Property row: grip handle reorders, the rest edits in place. */
function CustomPropertyRow({ property, pages, onOpenPage, onRename, onValueChange, onSettingsSave, onRemove }: CustomPropertyRowProps) {
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
        <PropertyInput property={property} pages={pages} onChange={onValueChange} onOpenPage={onOpenPage} />
      </div>
      <div className={styles.rowActions}>
        {hasSettings(property.type) && <PropertySettings definition={property} onSave={onSettingsSave} />}
        <button type="button" className={styles.iconButton} aria-label={`Remove ${property.label}`} onClick={onRemove}><icons.close size={14} /></button>
      </div>
    </Reorder.Item>
  )
}
