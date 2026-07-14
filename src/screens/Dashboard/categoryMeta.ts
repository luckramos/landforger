import type { Category } from '../../domain/types'

export interface CategoryMeta {
  category: Category
  label: string
  icon: string
}

export const CATEGORY_META: CategoryMeta[] = [
  { category: 'stories', label: 'Stories', icon: '✦' },
  { category: 'eras', label: 'Eras', icon: '◐' },
  { category: 'characters', label: 'Characters', icon: '♙' },
  { category: 'locations', label: 'Locations', icon: '⌖' },
  { category: 'items', label: 'Items', icon: '◇' },
  { category: 'organizations', label: 'Organizations', icon: '⬡' },
  { category: 'events', label: 'Events', icon: '✺' },
]

export function categoryMeta(category: string): CategoryMeta | undefined {
  return CATEGORY_META.find((item) => item.category === category)
}
