import { Lock, LockOpen } from '@phosphor-icons/react'
import type { Icon, IconProps } from '@phosphor-icons/react'

/**
 * Semantic icon barrel.
 *
 * No screen may import `@phosphor-icons/react` directly — everything renders
 * through the semantic names exported here. This keeps icon choice (which
 * specific Phosphor glyph, weight, size) a single decision point, and lets
 * later issues add more semantic names without touching call sites.
 */

const DEFAULT_WEIGHT: NonNullable<IconProps['weight']> = 'light'
const DEFAULT_SIZE: NonNullable<IconProps['size']> = 20

/** Wraps a Phosphor icon component with the app's default weight and size. Icons inherit `currentColor` unless `color` is passed. */
function withDefaults(PhosphorIcon: Icon) {
  function SemanticIcon(props: IconProps) {
    return <PhosphorIcon weight={DEFAULT_WEIGHT} size={DEFAULT_SIZE} {...props} />
  }
  SemanticIcon.displayName = `SemanticIcon(${PhosphorIcon.displayName ?? 'Icon'})`
  return SemanticIcon
}

/** Semantic icon names available to screens. Add new entries here as later issues need more glyphs. */
export const icons = {
  lock: withDefaults(Lock),
  unlock: withDefaults(LockOpen),
}

export type IconName = keyof typeof icons

export type { IconProps }
