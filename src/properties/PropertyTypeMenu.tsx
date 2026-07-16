import { Fragment, useEffect, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { CustomPropertyType } from '../domain/types'
import { icons, type IconProps } from '../icons'
import { anchoredMenuRowVariants, anchoredMenuVariants } from '../components/motionPrefs'
import styles from './Properties.module.css'

/**
 * The add-property type picker. One grouped, described, animated list rendered
 * two ways: a click-to-open `dropdown` (the "Add property" card — closes on
 * click-outside, Escape, or selection) and an always-visible `inline` list
 * (the Category Template dialog). Both share the same rows so the two pickers
 * read as one component.
 */

interface TypeMeta {
  type: CustomPropertyType
  /** Menu label — cosmetic; the machine-facing name still comes from `itemLabel`. */
  name: string
  hint: string
  icon: ComponentType<IconProps>
}

const GROUPS: { heading: string; items: TypeMeta[] }[] = [
  {
    heading: 'Values',
    items: [
      { type: 'text', name: 'Text', hint: 'A single line', icon: icons.typeText },
      { type: 'textarea', name: 'Long text', hint: 'Multiple lines', icon: icons.typeTextarea },
      { type: 'number', name: 'Number', hint: 'A numeric value', icon: icons.typeNumber },
      { type: 'date', name: 'Date', hint: 'A calendar date', icon: icons.typeDate },
    ],
  },
  {
    heading: 'Links & media',
    items: [
      { type: 'select', name: 'Select', hint: 'Choose from options', icon: icons.typeSelect },
      { type: 'relation', name: 'Relation', hint: 'Link to another Page', icon: icons.typeRelation },
      { type: 'image', name: 'Image', hint: 'A picture or cover', icon: icons.typeImage },
    ],
  },
]

interface PropertyTypeMenuProps {
  variant?: 'dropdown' | 'inline'
  motionScale: number
  onSelect: (type: CustomPropertyType) => void
  /** Machine-facing label for each option (drives aria-label + test queries). */
  itemLabel: (type: CustomPropertyType) => string
  /** Dropdown trigger text (dropdown variant only). */
  triggerLabel?: string
}

export function PropertyTypeMenu({
  variant = 'dropdown',
  motionScale,
  onSelect,
  itemLabel,
  triggerLabel = 'Add property',
}: PropertyTypeMenuProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Dropdown only: dismiss on outside pointer or Escape, returning focus to the trigger.
  useEffect(() => {
    if (variant !== 'dropdown' || !open) return
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
  }, [variant, open])

  const select = (type: CustomPropertyType) => {
    onSelect(type)
    if (variant === 'dropdown') setOpen(false)
  }

  // Roving focus across the option buttons.
  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const options = listRef.current ? [...listRef.current.querySelectorAll<HTMLButtonElement>('button')] : []
    if (options.length === 0) return
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const focus = (index: number) => {
      event.preventDefault()
      options[(index + options.length) % options.length].focus()
    }
    if (event.key === 'ArrowDown') focus(current + 1)
    else if (event.key === 'ArrowUp') focus(current - 1)
    else if (event.key === 'Home') focus(0)
    else if (event.key === 'End') focus(options.length - 1)
  }

  const list = (
    <div
      ref={listRef}
      className={styles.typeMenuList}
      role="group"
      aria-label="Property type"
      onKeyDown={onListKeyDown}
    >
      {GROUPS.map((group) => (
        <Fragment key={group.heading}>
          <motion.p className={styles.typeGroupHeading} variants={anchoredMenuRowVariants()} aria-hidden="true">
            {group.heading}
          </motion.p>
          {group.items.map((meta) => {
            const Glyph = meta.icon
            return (
              <motion.button
                type="button"
                key={meta.type}
                className={styles.typeOption}
                aria-label={itemLabel(meta.type)}
                variants={anchoredMenuRowVariants()}
                onClick={() => select(meta.type)}
              >
                <span className={styles.typeGlyph} aria-hidden="true">
                  <Glyph size={16} />
                </span>
                <span className={styles.typeCopy}>
                  <span className={styles.typeName}>{meta.name}</span>
                  <span className={styles.typeHint}>{meta.hint}</span>
                </span>
              </motion.button>
            )
          })}
        </Fragment>
      ))}
    </div>
  )

  if (variant === 'inline') {
    return (
      <motion.div
        className={`${styles.typeMenu} ${styles.typeMenuInline}`}
        variants={anchoredMenuVariants(motionScale)}
        initial="hidden"
        animate="visible"
      >
        {list}
      </motion.div>
    )
  }

  return (
    <div className={styles.typeMenuAnchor} ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.addCard}
        aria-label={triggerLabel}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <icons.add size={15} /> {triggerLabel}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.typeMenu}
            variants={anchoredMenuVariants(motionScale)}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {list}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
