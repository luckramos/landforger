import { joinFrontmatter, splitFrontmatter } from './frontmatter'
import { CATEGORIES, type Category, type CustomProperty, type CustomPropertyType, type Page } from './types'
import type { YamlValue } from './yaml'

function asString(value: YamlValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: YamlValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function asCategory(value: YamlValue | undefined): Category {
  if (typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)) return value as Category
  throw new Error(`Page frontmatter has an invalid or missing category: ${JSON.stringify(value)}`)
}

function isRecord(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function propertyToRecord(prop: CustomProperty): { [key: string]: YamlValue } {
  const record: { [key: string]: YamlValue } = { key: prop.key, label: prop.label, type: prop.type }
  if (prop.options) record.options = prop.options
  if (prop.targetCategories) record.targetCategories = prop.targetCategories
  record.value = prop.value
  return record
}

function propertyFromRecord(raw: YamlValue): CustomProperty {
  if (!isRecord(raw)) throw new Error('Malformed custom property entry in frontmatter')
  const property: CustomProperty = {
    key: asString(raw.key),
    label: asString(raw.label),
    type: asString(raw.type) as CustomPropertyType,
    // Custom Property values are flat by construction (string | string[] | number) —
    // trusted here because this codec is the only writer of `properties`.
    value: (Array.isArray(raw.value) ? asStringArray(raw.value) : raw.value) as CustomProperty['value'],
  }
  if (Array.isArray(raw.options)) property.options = asStringArray(raw.options)
  if (Array.isArray(raw.targetCategories)) property.targetCategories = asStringArray(raw.targetCategories) as Category[]
  return property
}

/** Serializes a Page to a Markdown string (frontmatter + body). Callers never hand-write frontmatter. */
export function pageToMarkdown(page: Page): string {
  const data: { [key: string]: YamlValue } = {
    slug: page.slug,
    title: page.title,
    category: page.category,
    tags: page.tags,
    summary: page.summary,
  }
  if (page.cover !== undefined) data.cover = page.cover
  data.eras = page.eras
  data.created = page.created
  data.updated = page.updated
  data.properties = page.customProperties.map(propertyToRecord)
  return joinFrontmatter(data, page.body)
}

/** Parses a Markdown string into a Page. The inverse of `pageToMarkdown`. */
export function pageFromMarkdown(md: string): Page {
  const { data, body } = splitFrontmatter(md)
  const propertiesRaw = Array.isArray(data.properties) ? data.properties : []
  const cover = typeof data.cover === 'string' ? data.cover : undefined
  return {
    slug: asString(data.slug),
    title: asString(data.title),
    category: asCategory(data.category),
    tags: asStringArray(data.tags),
    summary: asString(data.summary),
    ...(cover !== undefined ? { cover } : {}),
    eras: asStringArray(data.eras),
    created: asString(data.created),
    updated: asString(data.updated),
    customProperties: propertiesRaw.map(propertyFromRecord),
    body,
  }
}
