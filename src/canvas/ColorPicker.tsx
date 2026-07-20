import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useState } from 'react'
import { CHROMA_MAX, clampOklch, DEFAULT_CANVAS_OKLCH, formatOklch, parseOklch, type Oklch } from './color'
import styles from './ColorPicker.module.css'

interface ColorPickerProps {
  /** Current color; parsed into OKLCH channels (falls back to a neutral if not oklch). */
  value: string
  onChange: (color: string) => void
}

function localFraction(event: { clientX: number; clientY: number }, element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width,
    y: rect.height === 0 ? 0 : (event.clientY - rect.top) / rect.height,
  }
}

/**
 * A bespoke OKLCH color picker — a lightness×chroma area plus a hue rail, both
 * pointer-driven. No native `<input type="color">`, no third-party library; it
 * emits canonical `oklch(L C H)` strings straight into the canvas model.
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [oklch, setOklch] = useState<Oklch>(() => parseOklch(value) ?? DEFAULT_CANVAS_OKLCH)

  const emit = (next: Oklch) => {
    const clamped = clampOklch(next)
    setOklch(clamped)
    onChange(formatOklch(clamped))
  }

  const beginArea = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateArea(event)
  }
  const updateArea = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.buttons === 0 && event.type === 'pointermove') return
    const { x, y } = localFraction(event, event.currentTarget)
    emit({ ...oklch, c: Math.min(1, Math.max(0, x)) * CHROMA_MAX, l: 1 - Math.min(1, Math.max(0, y)) })
  }

  const beginHue = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateHue(event)
  }
  const updateHue = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.buttons === 0 && event.type === 'pointermove') return
    const { x } = localFraction(event, event.currentTarget)
    emit({ ...oklch, h: Math.min(1, Math.max(0, x)) * 360 })
  }

  const onAreaKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01
    if (event.key === 'ArrowRight') emit({ ...oklch, c: oklch.c + CHROMA_MAX * step })
    else if (event.key === 'ArrowLeft') emit({ ...oklch, c: oklch.c - CHROMA_MAX * step })
    else if (event.key === 'ArrowUp') emit({ ...oklch, l: oklch.l + step })
    else if (event.key === 'ArrowDown') emit({ ...oklch, l: oklch.l - step })
    else return
    event.preventDefault()
  }
  const onHueKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 15 : 3
    if (event.key === 'ArrowRight') emit({ ...oklch, h: oklch.h + step })
    else if (event.key === 'ArrowLeft') emit({ ...oklch, h: oklch.h - step })
    else return
    event.preventDefault()
  }

  const color = formatOklch(oklch)
  const areaStyle = { '--picker-hue': oklch.h } as CSSProperties
  const areaThumb = { left: `${(oklch.c / CHROMA_MAX) * 100}%`, top: `${(1 - oklch.l) * 100}%` }
  const hueThumb = { left: `${(oklch.h / 360) * 100}%` }

  return (
    <div
      className={styles.picker}
      role="group"
      aria-label="Color picker"
      style={{ '--picker-value': color } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={styles.area}
        role="slider"
        aria-label="Lightness and chroma"
        aria-valuetext={color}
        tabIndex={0}
        style={areaStyle}
        onPointerDown={beginArea}
        onPointerMove={updateArea}
        onKeyDown={onAreaKey}
      >
        <span className={styles.areaThumb} style={areaThumb} aria-hidden="true" />
      </div>
      <div
        className={styles.hue}
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(oklch.h)}
        tabIndex={0}
        onPointerDown={beginHue}
        onPointerMove={updateHue}
        onKeyDown={onHueKey}
      >
        <span className={styles.hueThumb} style={hueThumb} aria-hidden="true" />
      </div>
      <div className={styles.footer}>
        <span className={styles.swatch} aria-hidden="true" />
        <span className={styles.value}>{color}</span>
      </div>
    </div>
  )
}
