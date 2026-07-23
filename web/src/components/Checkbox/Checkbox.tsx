import { forwardRef } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import styles from './Checkbox.module.css'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Visible label beside the box. Omit for a standalone box (pass `aria-label`). */
  children?: ReactNode
}

/**
 * The house Checkbox: a real (visually-hidden) `<input type="checkbox">` for
 * native semantics, focus and form value, paired with a bronze-filling box and
 * an ink-drawn tick (the check strokes itself on via `stroke-dashoffset`, the
 * same vocabulary as `styles/cardHover` `.ink`). Owns hover, `:active` press
 * `scale(0.96)`, and forwards the global bronze `:focus-visible` ring onto the
 * visible box. All motion collapses under `prefers-reduced-motion`.
 *
 * Visual references: Auth's hand-rolled "Remember me" box (Auth.module.css
 * §.checkboxBox) and Button's bronze gradient (Button.module.css §.primary).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { children, className, disabled, ...rest },
  ref,
) {
  const classes = [styles.root, disabled && styles.disabled, className].filter(Boolean).join(' ')

  return (
    <label className={classes}>
      <input ref={ref} type="checkbox" className={styles.input} disabled={disabled} {...rest} />
      <span className={styles.box} aria-hidden="true">
        <svg className={styles.check} viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5 L10 17.5 L19 6.5" />
        </svg>
      </span>
      {children != null && <span className={styles.label}>{children}</span>}
    </label>
  )
})
