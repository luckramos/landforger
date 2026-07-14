import type { CSSProperties, MouseEvent } from 'react'
import type { World } from '../../domain/types'
import { formatRelativeTime } from './relativeTime'
import styles from './WorldCard.module.css'

interface WorldCardProps {
  world: World
  entryCount: number
  /** Render position among currently-mounted cards — drives the entrance stagger delay. */
  index?: number
  /**
   * Fires on click and on Enter/Space (native `<button>` activation fires
   * both as a `click`). Receives the event so callers can read
   * `event.currentTarget`'s position — e.g. to anchor the selection burst.
   */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  /** `false` for the live preview in the create modal: no click, no stagger delay. */
  interactive?: boolean
}

/** A World card in the `/worlds` grid (design-inventory.md §2.2). */
export function WorldCard({ world, entryCount, index = 0, onClick, interactive = true }: WorldCardProps) {
  const style = {
    '--card-color': world.color,
    animationDelay: interactive ? `calc(var(--mo, 1) * ${index * 70}ms)` : '0ms',
  } as CSSProperties

  return (
    <button type="button" className={styles.card} style={style} onClick={onClick} disabled={!interactive}>
      <div className={styles.cover}>
        <div className={styles.hatch} aria-hidden="true" />
        <span className={styles.initial} aria-hidden="true">
          {world.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span className={styles.genreBadge}>{world.genre}</span>
      </div>
      <div className={styles.body}>
        <h3 className={styles.name}>{world.name}</h3>
        <p className={styles.logline}>{world.logline}</p>
        <div className={styles.meta}>
          <span>{entryCount} entries</span>
          <span>{formatRelativeTime(world.updated)}</span>
        </div>
      </div>
    </button>
  )
}
