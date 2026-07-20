import type { CanvasItem, CanvasLink, NodeSource, ReferenceCanvas } from '../canvas/types'
import { joinFrontmatter, splitFrontmatter } from './frontmatter'
import { CATEGORIES, type Category, type CategoryTemplate, type PropertyDef, type Pin, type World, type WorldMap } from './types'
import type { YamlValue } from './yaml'

function asString(value: YamlValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: YamlValue | undefined, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

function asBoolean(value: YamlValue | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asStringArray(value: YamlValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function isRecord(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asCategory(value: YamlValue | undefined): Category {
  if (typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)) return value as Category
  throw new Error(`World frontmatter has an invalid or missing category: ${JSON.stringify(value)}`)
}

// --- Category Templates ---

function propertyDefToRecord(def: PropertyDef): { [key: string]: YamlValue } {
  const record: { [key: string]: YamlValue } = { key: def.key, label: def.label, type: def.type }
  if (def.options) record.options = def.options
  if (def.targetCategories) record.targetCategories = def.targetCategories
  return record
}

function propertyDefFromRecord(raw: YamlValue): PropertyDef {
  if (!isRecord(raw)) throw new Error('Malformed property definition in category template')
  const def: PropertyDef = { key: asString(raw.key), label: asString(raw.label), type: asString(raw.type) as PropertyDef['type'] }
  if (Array.isArray(raw.options)) def.options = asStringArray(raw.options)
  if (Array.isArray(raw.targetCategories)) def.targetCategories = asStringArray(raw.targetCategories) as Category[]
  return def
}

function categoryTemplateToRecord(template: CategoryTemplate): { [key: string]: YamlValue } {
  return { category: template.category, properties: template.properties.map(propertyDefToRecord) }
}

function categoryTemplateFromRecord(raw: YamlValue): CategoryTemplate {
  if (!isRecord(raw)) throw new Error('Malformed category template entry')
  const propertiesRaw = Array.isArray(raw.properties) ? raw.properties : []
  return { category: asCategory(raw.category), properties: propertiesRaw.map(propertyDefFromRecord) }
}

// --- Maps & Pins ---

function mapToRecord(map: WorldMap): { [key: string]: YamlValue } {
  const record: { [key: string]: YamlValue } = { id: map.id, title: map.title, eraLinked: map.eraLinked, images: map.images }
  if (map.parentMap) record.parentMap = map.parentMap
  if (map.parentPin) record.parentPin = map.parentPin
  return record
}

function mapFromRecord(raw: YamlValue): WorldMap {
  if (!isRecord(raw)) throw new Error('Malformed map entry')
  const imagesRaw = raw.images
  const images: WorldMap['images'] = {}
  if (isRecord(imagesRaw)) {
    for (const [era, path] of Object.entries(imagesRaw)) {
      if (typeof path === 'string') images[era] = path
    }
  }
  const map: WorldMap = { id: asString(raw.id), title: asString(raw.title), eraLinked: asBoolean(raw.eraLinked), images }
  if (typeof raw.parentMap === 'string') map.parentMap = raw.parentMap
  if (typeof raw.parentPin === 'string') map.parentPin = raw.parentPin
  return map
}

function pinToRecord(pin: Pin): { [key: string]: YamlValue } {
  const record: { [key: string]: YamlValue } = {
    id: pin.id,
    mapId: pin.mapId,
    pageSlug: pin.pageSlug,
    x: pin.x,
    y: pin.y,
    eras: pin.eras,
  }
  if (pin.childMap) record.childMap = pin.childMap
  return record
}

function pinFromRecord(raw: YamlValue): Pin {
  if (!isRecord(raw)) throw new Error('Malformed pin entry')
  const pin: Pin = {
    id: asString(raw.id),
    mapId: asString(raw.mapId),
    pageSlug: asString(raw.pageSlug),
    x: asNumber(raw.x),
    y: asNumber(raw.y),
    eras: asStringArray(raw.eras),
  }
  if (typeof raw.childMap === 'string') pin.childMap = raw.childMap
  return pin
}

// --- Reference Canvas ---
// A reference mood board: annotation items (text/sticky) plus reference nodes
// (later slices), joined by canvas-local N-to-N links. Only references — never
// file bytes — are serialized here; MD stays the source of truth.

function canvasItemToRecord(item: CanvasItem): { [key: string]: YamlValue } {
  const record: { [key: string]: YamlValue } = {
    id: item.id,
    kind: item.kind,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    color: item.color,
  }
  if (item.kind === 'text' || item.kind === 'sticky') record.text = item.text
  if (item.kind === 'stroke') record.points = item.points.map((point) => ({ x: point.x, y: point.y }))
  if (item.kind === 'image') {
    record.source = nodeSourceToRecord(item.source)
    record.caption = item.caption
  }
  if (item.kind === 'link' || item.kind === 'pdf' || item.kind === 'md') {
    record.source = nodeSourceToRecord(item.source)
    record.title = item.title
  }
  return record
}

function nodeSourceToRecord(source: NodeSource): { [key: string]: YamlValue } {
  return source.type === 'asset'
    ? { type: 'asset', assetId: source.assetId, filename: source.filename, mime: source.mime, size: source.size }
    : { type: 'url', href: source.href }
}

function nodeSourceFromRecord(raw: YamlValue): NodeSource {
  if (!isRecord(raw)) throw new Error('Malformed node source')
  if (raw.type === 'url') return { type: 'url', href: asString(raw.href) }
  return {
    type: 'asset',
    assetId: asString(raw.assetId),
    filename: asString(raw.filename),
    mime: asString(raw.mime),
    size: asNumber(raw.size),
  }
}

function canvasItemFromRecord(raw: YamlValue): CanvasItem {
  if (!isRecord(raw)) throw new Error('Malformed canvas item')
  const base = {
    id: asString(raw.id),
    x: asNumber(raw.x),
    y: asNumber(raw.y),
    width: asNumber(raw.width),
    height: asNumber(raw.height),
    rotation: asNumber(raw.rotation),
    color: asString(raw.color),
  }
  switch (raw.kind) {
    case 'text':
    case 'sticky':
      return { ...base, kind: raw.kind, text: asString(raw.text) }
    case 'stroke':
      return {
        ...base,
        kind: 'stroke',
        points: Array.isArray(raw.points)
          ? raw.points.filter(isRecord).map((point) => ({ x: asNumber(point.x), y: asNumber(point.y) }))
          : [],
      }
    case 'image':
      return { ...base, kind: 'image', source: nodeSourceFromRecord(raw.source), caption: asString(raw.caption) }
    case 'pdf':
      return { ...base, kind: 'pdf', source: nodeSourceFromRecord(raw.source), title: asString(raw.title) }
    case 'md': {
      const source = nodeSourceFromRecord(raw.source)
      if (source.type !== 'asset') throw new Error('Markdown node source must be an asset')
      return { ...base, kind: 'md', source, title: asString(raw.title) }
    }
    case 'link': {
      const source = nodeSourceFromRecord(raw.source)
      if (source.type !== 'url') throw new Error('Link node source must be a URL')
      return { ...base, kind: 'link', source, title: asString(raw.title) }
    }
    default:
      throw new Error(`Malformed canvas item kind: ${JSON.stringify(raw.kind)}`)
  }
}

function canvasLinkToRecord(link: CanvasLink): { [key: string]: YamlValue } {
  return { id: link.id, fromId: link.fromId, toId: link.toId }
}

function canvasLinkFromRecord(raw: YamlValue): CanvasLink {
  if (!isRecord(raw)) throw new Error('Malformed canvas link')
  return { id: asString(raw.id), fromId: asString(raw.fromId), toId: asString(raw.toId) }
}

function canvasToRecord(canvas: ReferenceCanvas): { [key: string]: YamlValue } {
  return {
    items: canvas.items.map(canvasItemToRecord),
    links: canvas.links.map(canvasLinkToRecord),
  }
}

function canvasFromRecord(raw: YamlValue): ReferenceCanvas {
  if (!isRecord(raw)) throw new Error('Malformed reference canvas')
  return {
    items: Array.isArray(raw.items) ? raw.items.map(canvasItemFromRecord) : [],
    links: Array.isArray(raw.links) ? raw.links.map(canvasLinkFromRecord) : [],
  }
}

/** Serializes a World to `_world.md` (frontmatter: meta, era order, templates, maps & pins; body: free-form notes). */
export function worldToMarkdown(world: World): string {
  const data: { [key: string]: YamlValue } = {
    slug: world.slug,
    name: world.name,
    genre: world.genre,
    color: world.color,
    logline: world.logline,
    eraOrder: world.eraOrder,
    activeEra: world.activeEra,
  }
  if (world.rootMap) data.rootMap = world.rootMap
  data.categoryTemplates = world.categoryTemplates.map(categoryTemplateToRecord)
  data.maps = world.maps.map(mapToRecord)
  data.pins = world.pins.map(pinToRecord)
  if (world.canvas) data.canvas = canvasToRecord(world.canvas)
  data.created = world.created
  data.updated = world.updated
  return joinFrontmatter(data, world.body)
}

/** Parses `_world.md` into a World. The inverse of `worldToMarkdown`. */
export function worldFromMarkdown(md: string): World {
  const { data, body } = splitFrontmatter(md)
  const templatesRaw = Array.isArray(data.categoryTemplates) ? data.categoryTemplates : []
  const mapsRaw = Array.isArray(data.maps) ? data.maps : []
  const pinsRaw = Array.isArray(data.pins) ? data.pins : []
  const rootMap = typeof data.rootMap === 'string' ? data.rootMap : undefined
  const canvas = data.canvas === undefined ? undefined : canvasFromRecord(data.canvas)
  return {
    slug: asString(data.slug),
    name: asString(data.name),
    genre: asString(data.genre),
    color: asString(data.color),
    logline: asString(data.logline),
    eraOrder: asStringArray(data.eraOrder),
    activeEra: asString(data.activeEra),
    ...(rootMap !== undefined ? { rootMap } : {}),
    categoryTemplates: templatesRaw.map(categoryTemplateFromRecord),
    maps: mapsRaw.map(mapFromRecord),
    pins: pinsRaw.map(pinFromRecord),
    ...(canvas !== undefined ? { canvas } : {}),
    created: asString(data.created),
    updated: asString(data.updated),
    body,
  }
}
