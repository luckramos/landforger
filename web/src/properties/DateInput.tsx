import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { overlayExitTransition } from '../components/motionPrefs'
import { useUiStore } from '../state/uiStore'
import { icons } from '../icons'
import styles from './Properties.module.css'

interface DateInputProps {
  value: string
  label: string
  disabled?: boolean
  onChange: (value: string) => void
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`

/** Parses `YYYY-MM-DD` into calendar parts; null if it isn't a full ISO date. */
function parseISO(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** Monday-first weekday index (0–6) for the 1st of a month. */
function firstWeekdayIndex(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

/**
 * Date field with a fully custom month-grid calendar — no native date picker.
 * The text field holds the canonical `YYYY-MM-DD` value; the calendar is a
 * click-driven helper that writes the same format.
 */
export function DateInput({ value, label, disabled = false, onChange }: DateInputProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [open, setOpen] = useState(false)
  const selected = parseISO(value)
  const today = new Date()
  const [view, setView] = useState(() => ({
    year: selected?.year ?? today.getFullYear(),
    month: selected?.month ?? today.getMonth(),
  }))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const openCalendar = () => {
    if (selected) setView({ year: selected.year, month: selected.month })
    setOpen(true)
  }

  const step = (delta: number) => setView((current) => {
    const next = current.month + delta
    return { year: current.year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 }
  })

  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const lead = firstWeekdayIndex(view.year, view.month)

  return (
    <div className={styles.dateField} ref={rootRef}>
      <input
        className={styles.input}
        aria-label={label}
        disabled={disabled}
        placeholder="YYYY-MM-DD"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {!disabled && (
        <button type="button" className={styles.dateTrigger} aria-label={`Open ${label} calendar`} aria-expanded={open} onClick={() => (open ? setOpen(false) : openCalendar())}>
          <icons.calendar size={15} />
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.calendar}
            role="dialog"
            aria-label={`${label} calendar`}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayExitTransition(motionScale)}
          >
            <div className={styles.calendarHead}>
              <button type="button" className={styles.iconButton} aria-label="Previous month" onClick={() => step(-1)}><icons.caretLeft size={13} /></button>
              <span>{MONTHS[view.month]} {view.year}</span>
              <button type="button" className={styles.iconButton} aria-label="Next month" onClick={() => step(1)}><icons.caretRight size={13} /></button>
            </div>
            <div className={styles.calendarWeekdays}>
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className={styles.calendarGrid}>
              {Array.from({ length: lead }).map((_, index) => <span key={`lead-${index}`} />)}
              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1
                const iso = toISO(view.year, view.month, day)
                const isSelected = selected?.year === view.year && selected?.month === view.month && selected?.day === day
                return (
                  <button
                    key={iso}
                    type="button"
                    className={styles.calendarDay}
                    data-selected={isSelected || undefined}
                    aria-label={iso}
                    aria-pressed={isSelected}
                    onClick={() => { onChange(iso); setOpen(false) }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
            {value && (
              <button type="button" className={styles.calendarClear} aria-label={`Clear ${label}`} onClick={() => { onChange(''); setOpen(false) }}>Clear</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
