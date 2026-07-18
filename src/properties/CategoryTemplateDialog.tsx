import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react'
import { DIALOG_CHUNK_VARIANTS, dialogChunkTransition, dialogContainerVariants, overlayExitTransition } from '../components/motionPrefs'
import type { Category, CustomPropertyType, PropertyDef, World } from '../domain/types'
import { templatePropertiesFor, uniquePropertyKey } from '../domain/properties'
import { categoryMeta } from '../screens/Dashboard/categoryMeta'
import { icons, type IconProps } from '../icons'
import type { ComponentType } from 'react'
import { PropertyDefinitionEditor } from './PropertyDefinitionEditor'
import { PropertyTypeMenu } from './PropertyTypeMenu'
import { hasSettings } from './PropertySettings'
import styles from './Properties.module.css'

const typeLabel = (type: CustomPropertyType) => type[0].toUpperCase() + type.slice(1)

const TYPE_ICON: Record<CustomPropertyType, ComponentType<IconProps>> = {
  text: icons.typeText,
  textarea: icons.typeTextarea,
  number: icons.typeNumber,
  date: icons.typeDate,
  select: icons.typeSelect,
  relation: icons.typeRelation,
  image: icons.typeImage,
}

interface CategoryTemplateDialogProps {
  world: World
  category: Category
  motionScale: number
  /** Dismiss without saving (Cancel, scrim, Escape). */
  onClose: () => void
  /** Commit the edited field set. The caller persists and closes the dialog. */
  onSave: (category: Category, properties: PropertyDef[]) => void
}

/**
 * Edits a World's Category Template — the Custom Properties new Pages of a
 * Category are born with. A field blueprint, not a value form: the category's
 * own identity heads the dialog, each field reads as a card (type glyph +
 * name + frontmatter key + inline type settings), and reordering sets the
 * order new Pages inherit. Shared by the category page's pencil and the Page
 * ⋯ menu so both entry points open one design.
 */
export function CategoryTemplateDialog({ world, category, motionScale, onClose, onSave }: CategoryTemplateDialogProps) {
  const meta = categoryMeta(category)
  const label = meta?.label ?? category
  const Icon = meta?.icon
  // Seeded once from the stored template: the dialog remounts on each open, and
  // must not clobber in-progress edits if the World refreshes under it mid-edit.
  const [draft, setDraft] = useState<PropertyDef[]>(() => structuredClone(templatePropertiesFor(world, category)))

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const updateByKey = (key: string, transform: (definition: PropertyDef) => PropertyDef) => {
    setDraft((properties) => properties.map((property) => (property.key === key ? transform(property) : property)))
  }
  const removeByKey = (key: string) => setDraft((properties) => properties.filter((property) => property.key !== key))
  const addProperty = (type: CustomPropertyType) => {
    setDraft((properties) => {
      const propertyLabel = `${typeLabel(type)} property`
      return [...properties, { key: uniquePropertyKey(propertyLabel, properties.map((property) => property.key)), label: propertyLabel, type }]
    })
  }

  const fieldCount = draft.length

  // Portal to <body> so the fixed scrim is anchored to the viewport, not to
  // whatever transformed ancestor (e.g. the route-view entrance animation) the
  // dialog was opened from — otherwise it can land off-screen and force a scroll.
  return createPortal(
    <motion.div
      className={styles.dialogScrim}
      role="presentation"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={overlayExitTransition(motionScale)}
      onClick={onClose}
    >
      <motion.div
        className={`${styles.dialog} ${styles.templateDialog}`}
        role="dialog"
        aria-label={`${label} template`}
        style={{ '--category-color': `var(--cat-${category})` } as React.CSSProperties}
        initial="hidden"
        animate="visible"
        variants={dialogContainerVariants(motionScale)}
        exit={{ opacity: 0, y: 6, scale: 0.985, transition: overlayExitTransition(motionScale) }}
        onClick={(event) => event.stopPropagation()}
      >
        <motion.header className={styles.templateHead} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
          <span className={styles.templateEyebrow}>Category template</span>
          <div className={styles.templateIdentity}>
            <span className={styles.templateIcon} aria-hidden="true">{Icon && <Icon size={24} />}</span>
            <h2 className={styles.templateTitle}>{label}</h2>
            <span className={styles.templateCount}>{fieldCount} {fieldCount === 1 ? 'field' : 'fields'}</span>
          </div>
          <p className={styles.templateLede}>
            New {label} are seeded with these fields. Editing the template never touches Pages that already exist.
          </p>
        </motion.header>

        <motion.div className={styles.dialogFields} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
          {fieldCount === 0 ? (
            <p className={styles.templateEmpty}>No fields yet — new {label} start blank. Add one below.</p>
          ) : (
            <Reorder.Group as="div" axis="y" className={styles.templateFieldList} values={draft} onReorder={setDraft}>
              <AnimatePresence initial={false}>
                {draft.map((definition) => (
                  <TemplateFieldRow
                    key={definition.key}
                    definition={definition}
                    onRename={(value) => updateByKey(definition.key, (current) => ({ ...current, label: value }))}
                    onDefinitionChange={(changed) => updateByKey(definition.key, () => changed)}
                    onRemove={() => removeByKey(definition.key)}
                  />
                ))}
              </AnimatePresence>
            </Reorder.Group>
          )}
          <PropertyTypeMenu
            motionScale={motionScale}
            onSelect={addProperty}
            itemLabel={(type) => `Add ${type} to template`}
            triggerLabel="Add property"
            flowMenu
          />
        </motion.div>

        <motion.div className={styles.dialogActions} variants={DIALOG_CHUNK_VARIANTS} transition={dialogChunkTransition(motionScale)}>
          <button type="button" className={styles.tintButton} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.tintPrimary} onClick={() => onSave(category, draft)}>Save template</button>
        </motion.div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

interface TemplateFieldRowProps {
  definition: PropertyDef
  onRename: (label: string) => void
  onDefinitionChange: (definition: PropertyDef) => void
  onRemove: () => void
}

/** One draggable field card: grip reorders, the type glyph identifies, the rest edits in place. */
function TemplateFieldRow({ definition, onRename, onDefinitionChange, onRemove }: TemplateFieldRowProps) {
  const controls = useDragControls()
  const Glyph = TYPE_ICON[definition.type]
  return (
    <Reorder.Item
      as="div"
      value={definition}
      className={styles.templateField}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileDrag={{ scale: 1.012, boxShadow: '0 14px 34px rgba(0, 0, 0, 0.45)' }}
      transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.6 }}
    >
      <div className={styles.templateFieldMain}>
        <button
          type="button"
          className={styles.templateFieldGrip}
          aria-label={`Reorder ${definition.label}`}
          onPointerDown={(event) => controls.start(event)}
        >
          <icons.grip size={14} />
        </button>
        <span className={styles.templateFieldGlyph} aria-hidden="true"><Glyph size={16} /></span>
        <span className={styles.templateFieldText}>
          <input
            className={styles.templateFieldName}
            aria-label={`Template property name for ${definition.key}`}
            value={definition.label}
            onChange={(event) => onRename(event.target.value)}
          />
          <span className={styles.templateFieldKey} title="Frontmatter key">{definition.key}</span>
        </span>
        <span className={styles.templateFieldType}>{definition.type}</span>
        <button
          type="button"
          className={styles.templateFieldRemove}
          aria-label={`Remove ${definition.label} from template`}
          onClick={onRemove}
        >
          <icons.close size={13} />
        </button>
      </div>
      {hasSettings(definition.type) && (
        <div className={styles.templateFieldSettings}>
          <PropertyDefinitionEditor definition={definition} onChange={onDefinitionChange} />
        </div>
      )}
    </Reorder.Item>
  )
}
