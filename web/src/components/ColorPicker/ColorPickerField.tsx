import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { anchoredMenuVariants } from '../motionPrefs'
import { useUiStore } from '../../state/uiStore'
import { icons } from '../../icons'
import { ColorPicker } from './ColorPicker'
import styles from './ColorPickerField.module.css'

interface ColorPickerFieldProps {
  value: string
  onChange: (hex: string) => void
  /** Labels the trigger + popover for assistive tech (e.g. "Custom world color"). */
  label?: string
}

const POPOVER_WIDTH = 248
/** Enough to decide a flip before the popover has measured itself (~field+rail+readout+padding). */
const POPOVER_EST_HEIGHT = 250
const GAP = 6
const MARGIN = 12

/** Fixed viewport coordinates for the popover, anchored under (or over) the trigger. */
function place(rect: DOMRect): CSSProperties {
  const left = Math.min(
    Math.max(MARGIN, rect.left),
    window.innerWidth - POPOVER_WIDTH - MARGIN,
  )
  const flipUp = rect.bottom + GAP + POPOVER_EST_HEIGHT > window.innerHeight && rect.top > POPOVER_EST_HEIGHT
  return flipUp
    ? { position: 'fixed', left, bottom: window.innerHeight - rect.top + GAP }
    : { position: 'fixed', left, top: rect.bottom + GAP }
}

/**
 * A swatch-and-hex trigger that opens the from-scratch {@link ColorPicker} in a
 * popover. The popover is portaled to `document.body` and `position: fixed`,
 * anchored to the trigger's viewport rect — so it escapes the create-world
 * modal's `overflow: auto` clipping (and any transformed ancestor), the same
 * reason {@link PageWidthControl} portals out. It tracks the trigger on scroll/
 * resize and dismisses on outside-pointer or Escape, returning focus to the
 * trigger — the app's standard anchored-menu behavior.
 */
export function ColorPickerField({ value, onChange, label = 'Color' }: ColorPickerFieldProps) {
  const motionScale = useUiStore((state) => state.motionScale)
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const reposition = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setStyle(place(rect))
  }

  // Measure before paint so the popover never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (open) reposition()
  }, [open])

  // Track the trigger while open (the modal scrolls) and dismiss on outside
  // pointer or Escape. `scroll` is captured so the modal panel's own scroll —
  // not just window — keeps the popover pinned to the trigger.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  return (
    <div className={styles.field}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.swatch} style={{ background: value }} aria-hidden="true" />
        <span className={styles.value}>{value}</span>
        <span className={styles.caret} aria-hidden="true">
          <icons.caretDown size={13} />
        </span>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              className={styles.popover}
              style={style}
              role="dialog"
              aria-label={`${label} picker`}
              variants={anchoredMenuVariants(motionScale)}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <ColorPicker value={value} onChange={onChange} label={label} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
