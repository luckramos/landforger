import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { anchoredMenuRowVariants, anchoredMenuVariants } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import { icons } from '../icons'
import styles from './Properties.module.css'

interface SelectInputProps {
  value: string
  label: string
  options: string[]
  disabled?: boolean
  onChange: (value: string) => void
}

/**
 * A Select Property's value control: a trigger showing the current choice and
 * an anchored listbox popover of options (plus a "None" clear row). Closes on
 * click-outside, Escape, or choosing an option; keyboard-navigable. Replaces
 * the native `<select>` so it matches the app's other anchored menus.
 */
export function SelectInput({ value, label, options, disabled = false, onChange }: SelectInputProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Dismiss on outside pointer or Escape, returning focus to the trigger.
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

  // On open, land focus on the selected option (or the first row).
  useEffect(() => {
    if (!open) return
    const rows = listRef.current ? [...listRef.current.querySelectorAll<HTMLButtonElement>('button')] : []
    if (rows.length === 0) return
    const selected = rows.findIndex((row) => row.dataset.selected === 'true')
    rows[selected >= 0 ? selected : 0].focus()
  }, [open])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rows = listRef.current ? [...listRef.current.querySelectorAll<HTMLButtonElement>('button')] : []
    if (rows.length === 0) return
    const current = rows.indexOf(document.activeElement as HTMLButtonElement)
    const focus = (index: number) => {
      event.preventDefault()
      rows[(index + rows.length) % rows.length].focus()
    }
    if (event.key === 'ArrowDown') focus(current + 1)
    else if (event.key === 'ArrowUp') focus(current - 1)
    else if (event.key === 'Home') focus(0)
    else if (event.key === 'End') focus(rows.length - 1)
  }

  const renderOption = (optionValue: string, text: string) => {
    const selected = value === optionValue
    return (
      <motion.button
        key={optionValue || '__none__'}
        type="button"
        className={styles.selectOption}
        role="option"
        aria-selected={selected}
        data-selected={selected || undefined}
        variants={anchoredMenuRowVariants()}
        onClick={() => pick(optionValue)}
      >
        <span className={optionValue ? undefined : styles.selectOptionMuted}>{text}</span>
        {selected && <icons.check size={13} className={styles.selectCheck} aria-hidden="true" />}
      </motion.button>
    )
  }

  return (
    <div className={styles.selectField} ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.selectTrigger}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={value ? styles.selectValue : styles.selectPlaceholder}>{value || '—'}</span>
        <span className={styles.selectCaret} aria-hidden="true"><icons.caretDown size={13} /></span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            className={styles.selectMenu}
            role="listbox"
            aria-label={`${label} options`}
            variants={anchoredMenuVariants(motionScale)}
            initial="hidden"
            animate="visible"
            exit="exit"
            onKeyDown={onListKeyDown}
          >
            {renderOption('', 'None')}
            {options.map((option) => renderOption(option, option))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
