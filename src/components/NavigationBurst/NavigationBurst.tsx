import type { CSSProperties } from 'react'
import styles from './NavigationBurst.module.css'

/** Viewport-space point (px) the burst disc expands from. Omit to anchor at the viewport center. */
export interface NavigationBurstOrigin {
  x: number
  y: number
}

export interface NavigationBurstProps {
  /** CSS color for the expanding disc — a category color, World color, or design token. */
  color: string
  /** Destination name announced to assistive tech and shown in the overlay caption. */
  label: string
  origin?: NavigationBurstOrigin
}

/**
 * The catalogued burst-continuity transition: a colored disc expands from a
 * trigger point to cover the viewport while the destination route swaps in
 * mid-flash. Shared visual piece for Auth→Worlds, Map→Page, and World
 * selection — pair with `useNavigationBurst` for the begin/navigate timing.
 */
export function NavigationBurst({ color, label, origin }: NavigationBurstProps) {
  const style = {
    '--burst-color': color,
    ...(origin
      ? { '--burst-x': `${origin.x}px`, '--burst-y': `${origin.y}px` }
      : {}),
  } as CSSProperties

  return (
    <div className={styles.overlay} role="status" aria-label={`Opening ${label}`} style={style}>
      <i aria-hidden="true" />
      <span>Opening {label}…</span>
    </div>
  )
}
