// The Page's "measure" control: a quiet, bottom-right slider that sets the
// writing column's width. Pure/controlled — PageScreen wires `value`/`onChange`
// to the per-user uiStore so the choice persists across Pages and reloads.
//
// Rendered through a portal on <body> so no transformed/filtered ancestor (the
// per-route `.view` entrance animation traps `position: fixed`) can pin it to
// anything but the viewport — it stays put while the Page scrolls. It stays
// available in focus mode too: tuning the measure is part of a clean writing
// view, not chrome to hide.

import { createPortal } from 'react-dom'
import type { ChangeEvent, CSSProperties } from 'react'
import { icons } from '../icons'
import styles from './PageWidthControl.module.css'

export interface PageWidthControlProps {
  /** Current column width in CSS px. */
  value: number
  /** Narrowest allowed measure (the fixed default). */
  min: number
  /** Widest allowed measure. */
  max: number
  onChange: (value: number) => void
}

export function PageWidthControl({ value, min, max, onChange }: PageWidthControlProps) {
  // Fill portion drives the bronze track gradient (WebKit has no native progress
  // pseudo; Firefox uses ::-moz-range-progress and ignores this).
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0

  return createPortal(
    <div
      className={styles.control}
      style={{ '--fill': `${fill}%` } as CSSProperties}
    >
      <span className={styles.readout} aria-hidden="true">{value}px</span>
      <span className={styles.icon} aria-hidden="true">
        <icons.documentWidth size={15} />
      </span>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={8}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
        aria-label="Page width"
        aria-valuetext={`${value} pixels`}
      />
    </div>,
    document.body,
  )
}
