import {
  ArrowRight,
  BookOpen,
  CalendarStar,
  CaretDown,
  CaretLeft,
  CaretRight,
  CastleTurret,
  Circle,
  Clock,
  Compass,
  Diamond,
  DotsSixVertical,
  DotsThree,
  Gear,
  Hourglass,
  House,
  Lock,
  LockOpen,
  MagnifyingGlass,
  MapPin,
  Minus,
  Plus,
  ShareNetwork,
  SquaresFour,
  Sword,
  Target,
  User,
  X,
} from '@phosphor-icons/react'
import type { Icon, IconProps } from '@phosphor-icons/react'
import type { ComponentType } from 'react'
import type { Category } from '../domain/types'
import styles from './index.module.css'

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

/**
 * Wraps a Phosphor icon for Category use: Duotone weight, with the
 * background wash bound to whatever `--icon-secondary-color` the call site
 * sets (typically `var(--cat-<category>)`) via `index.module.css`. The
 * outline path is left on `currentColor` so it stays legible against any
 * background — only the wash carries the Category color.
 */
function withCategoryDefaults(PhosphorIcon: Icon) {
  function SemanticCategoryIcon({ className, ...rest }: IconProps) {
    const mergedClassName = className ? `${styles.categoryIcon} ${className}` : styles.categoryIcon
    return <PhosphorIcon weight="duotone" size={DEFAULT_SIZE} {...rest} className={mergedClassName} />
  }
  SemanticCategoryIcon.displayName = `SemanticCategoryIcon(${PhosphorIcon.displayName ?? 'Icon'})`
  return SemanticCategoryIcon
}

/** Semantic icon names available to screens. Add new entries here as later issues need more glyphs. */
export const icons = {
  lock: withDefaults(Lock),
  unlock: withDefaults(LockOpen),

  // Dashboard shell chrome
  caretLeft: withDefaults(CaretLeft),
  caretRight: withDefaults(CaretRight),
  caretDown: withDefaults(CaretDown),
  add: withDefaults(Plus),
  home: withDefaults(House),
  map: withDefaults(Compass),
  timeline: withDefaults(Clock),
  graph: withDefaults(ShareNetwork),
  canvas: withDefaults(SquaresFour),
  search: withDefaults(MagnifyingGlass),
  focus: withDefaults(Target),
  close: withDefaults(X),
  settings: withDefaults(Gear),
  minus: withDefaults(Minus),
  marker: withDefaults(Diamond),
  circle: withDefaults(Circle),
  grip: withDefaults(DotsSixVertical),
  moreHorizontal: withDefaults(DotsThree),
  arrowRight: withDefaults(ArrowRight),
}

/**
 * Category icons: Phosphor Duotone, one per Page Category. `categoryMeta.ts`
 * pairs these with labels/colors; every consumer renders through that
 * module rather than importing this map directly.
 */
export const categoryIcons: Record<Category, ComponentType<IconProps>> = {
  stories: withCategoryDefaults(BookOpen),
  eras: withCategoryDefaults(Hourglass),
  characters: withCategoryDefaults(User),
  locations: withCategoryDefaults(MapPin),
  items: withCategoryDefaults(Sword),
  organizations: withCategoryDefaults(CastleTurret),
  events: withCategoryDefaults(CalendarStar),
}

export type IconName = keyof typeof icons

export type { IconProps }
