import type { ComponentType } from 'react'
import type { Category } from '../../domain/types'
import { categoryIcons, type IconProps } from '../../icons'

export interface CategoryMeta {
  category: Category
  label: string
  icon: ComponentType<IconProps>
}

export const CATEGORY_META: CategoryMeta[] = [
  { category: 'stories', label: 'Stories', icon: categoryIcons.stories },
  { category: 'eras', label: 'Eras', icon: categoryIcons.eras },
  { category: 'characters', label: 'Characters', icon: categoryIcons.characters },
  { category: 'locations', label: 'Locations', icon: categoryIcons.locations },
  { category: 'items', label: 'Items', icon: categoryIcons.items },
  { category: 'organizations', label: 'Organizations', icon: categoryIcons.organizations },
  { category: 'events', label: 'Events', icon: categoryIcons.events },
]

export function categoryMeta(category: string): CategoryMeta | undefined {
  return CATEGORY_META.find((item) => item.category === category)
}
