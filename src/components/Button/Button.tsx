import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` — bronze gradient fill (Auth submit parity). `ghost` — outline pill (PageScreen CTA parity). */
  variant?: ButtonVariant
  children: ReactNode
}

/**
 * The house Button: owns hover, `:active` press, `:focus-visible` (inherited
 * from the global ring), and the single disabled treatment shared by every
 * primary CTA. See design-inventory.md §2.1/§2.2 for the visual references.
 */
export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  const variantClass = variant === 'ghost' ? styles.ghost : styles.primary
  const classes = [styles.button, variantClass, className].filter(Boolean).join(' ')

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}
