import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import styles from './ColorPicker.module.css'
import { hexToHsv, hsvToHex, parseHex, type Hsv } from './color'

interface ColorPickerProps {
  /** Controlled hex value (`#rrggbb`). */
  value: string
  onChange: (hex: string) => void
  /** Labels the field for assistive tech (e.g. "Custom world color"). */
  label?: string
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const step = (e: KeyboardEvent, coarse: number) => (e.shiftKey ? coarse * 4 : coarse)

/**
 * A color picker built entirely from scratch — no native `<input type="color">`.
 * A saturation/brightness field (drag or arrow-key) sits over a hue rail; the
 * chosen color reads out as an editable mono hex string beside a hairline-framed
 * swatch. HSV is the internal source of truth (kept whole so dragging one axis
 * never disturbs another — grey stays on its hue); the parent speaks hex.
 *
 * Both surfaces are real sliders (`role="slider"`, focusable, keyboard-driven)
 * and forward the house bronze `:focus-visible` ring. All motion is transition-
 * only, so it already collapses under `prefers-reduced-motion`.
 */
export function ColorPicker({ value, onChange, label = 'Color' }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const [hexDraft, setHexDraft] = useState(value)
  const emitted = useRef(value)

  // Re-seed from an external hex change (not one we just emitted) — keeps the
  // field in step if a parent ever resets the color programmatically.
  useEffect(() => {
    if (value.toLowerCase() === emitted.current.toLowerCase()) return
    emitted.current = value
    setHsv((prev) => hexToHsv(value, prev.h))
    setHexDraft(value)
  }, [value])

  function commit(next: Hsv) {
    setHsv(next)
    const hex = hsvToHex(next)
    emitted.current = hex
    setHexDraft(hex)
    onChange(hex)
  }

  const hueColor = hsvToHex({ h: hsv.h, s: 100, v: 100 })
  const hex = hsvToHex(hsv)

  // — saturation/brightness field —
  const fieldRef = useRef<HTMLDivElement>(null)
  const dragField = useRef(false)

  function pointField(e: PointerEvent) {
    const el = fieldRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1)
    commit({ h: hsv.h, s: Math.round(x * 100), v: Math.round((1 - y) * 100) })
  }

  function fieldKey(e: KeyboardEvent) {
    const d = step(e, 2)
    if (e.key === 'ArrowRight') commit({ ...hsv, s: clamp(hsv.s + d, 0, 100) })
    else if (e.key === 'ArrowLeft') commit({ ...hsv, s: clamp(hsv.s - d, 0, 100) })
    else if (e.key === 'ArrowUp') commit({ ...hsv, v: clamp(hsv.v + d, 0, 100) })
    else if (e.key === 'ArrowDown') commit({ ...hsv, v: clamp(hsv.v - d, 0, 100) })
    else return
    e.preventDefault()
  }

  // — hue rail —
  const railRef = useRef<HTMLDivElement>(null)
  const dragHue = useRef(false)

  function pointHue(e: PointerEvent) {
    const el = railRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    commit({ ...hsv, h: Math.round(x * 360) })
  }

  function hueKey(e: KeyboardEvent) {
    const d = step(e, 4)
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') commit({ ...hsv, h: (hsv.h + d) % 360 })
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') commit({ ...hsv, h: (hsv.h - d + 360) % 360 })
    else return
    e.preventDefault()
  }

  function onHexChange(raw: string) {
    setHexDraft(raw)
    const rgb = parseHex(raw)
    if (rgb) commit(hexToHsv(raw, hsv.h))
  }

  return (
    <div className={styles.root}>
      <div
        ref={fieldRef}
        className={styles.field}
        style={{ '--hue': hueColor } as CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label={`${label} saturation and brightness`}
        aria-valuetext={`saturation ${hsv.s}%, brightness ${hsv.v}%`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragField.current = true
          pointField(e)
        }}
        onPointerMove={(e) => dragField.current && pointField(e)}
        onPointerUp={(e) => {
          dragField.current = false
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onKeyDown={fieldKey}
      >
        <span
          className={styles.fieldThumb}
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, '--swatch': hex } as CSSProperties}
        />
      </div>

      <div className={styles.controls}>
        <div
          ref={railRef}
          className={styles.rail}
          role="slider"
          tabIndex={0}
          aria-label={`${label} hue`}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            dragHue.current = true
            pointHue(e)
          }}
          onPointerMove={(e) => dragHue.current && pointHue(e)}
          onPointerUp={(e) => {
            dragHue.current = false
            e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onKeyDown={hueKey}
        >
          <span className={styles.railThumb} style={{ left: `${(hsv.h / 360) * 100}%`, '--swatch': hueColor } as CSSProperties} />
        </div>

        <div className={styles.readout}>
          <span className={styles.swatch} style={{ background: hex }} aria-hidden="true" />
          <span className={styles.hash} aria-hidden="true">
            #
          </span>
          <input
            className={styles.hex}
            value={hexDraft.replace(/^#/, '')}
            onChange={(e) => onHexChange(e.target.value)}
            spellCheck={false}
            maxLength={6}
            aria-label={`${label} hex value`}
          />
        </div>
      </div>
    </div>
  )
}
