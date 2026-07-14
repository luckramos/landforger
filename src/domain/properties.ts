import type { Category, CustomProperty, CustomPropertyValue, PropertyDef, World } from './types'

const EMPTY_VALUE: Record<PropertyDef['type'], CustomPropertyValue> = {
  text: '',
  textarea: '',
  select: '',
  relation: [],
  image: '',
  number: 0,
  date: '',
}

/** Empty value used when a Category Template seeds a Page. */
export function emptyPropertyValue(definition: PropertyDef): CustomPropertyValue {
  return structuredClone(EMPTY_VALUE[definition.type])
}

export function templatePropertiesFor(world: World, category: Category): PropertyDef[] {
  return world.categoryTemplates.find((template) => template.category === category)?.properties ?? []
}

/** Materializes a template definition as a Page-owned, independently mutable Property. */
export function propertyFromDefinition(definition: PropertyDef): CustomProperty {
  return { ...structuredClone(definition), value: emptyPropertyValue(definition) }
}

/**
 * Applies a Category Template without treating it as a schema: Page-owned
 * Properties win by key, and only missing definitions are appended.
 */
export function mergeTemplateProperties(
  current: CustomProperty[],
  definitions: PropertyDef[],
): CustomProperty[] {
  const keys = new Set(current.map((property) => property.key))
  return [
    ...structuredClone(current),
    ...definitions.filter((definition) => !keys.has(definition.key)).map(propertyFromDefinition),
  ]
}

/** Produces a readable, frontmatter-safe key; callers resolve page-local collisions. */
export function propertyKeyFromLabel(label: string): string {
  const words = label.trim().match(/[\p{L}\p{N}]+/gu) ?? []
  return words
    .map((word, index) => {
      const normalized = word.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      return index === 0
        ? normalized.toLocaleLowerCase()
        : normalized[0]?.toLocaleUpperCase() + normalized.slice(1).toLocaleLowerCase()
    })
    .join('') || 'property'
}

export function uniquePropertyKey(label: string, usedKeys: Iterable<string>): string {
  const base = propertyKeyFromLabel(label)
  const used = new Set(usedKeys)
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}${suffix}`)) suffix += 1
  return `${base}${suffix}`
}
