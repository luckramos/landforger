import type { ReferenceCanvas } from '../canvas/types'

/** The seven fixed Page kinds (CONTEXT.md — "Category"). Order matches the design's sidebar. */
export const CATEGORIES = ['stories', 'eras', 'characters', 'locations', 'items', 'organizations', 'events'] as const

export type Category = (typeof CATEGORIES)[number]

/** The seven Custom Property types (CONTEXT.md — "Custom Property"). */
export type CustomPropertyType = 'text' | 'textarea' | 'select' | 'relation' | 'image' | 'number' | 'date'

/** `image` preview footprint. Size sets the base edge; orientation its aspect. */
export type ImageSize = 'small' | 'medium' | 'large'
export type ImageOrientation = 'landscape' | 'portrait'

/** Everything but `value` — a Custom Property definition a Category Template seeds new Pages with. */
export interface PropertyDef {
  key: string
  label: string
  type: CustomPropertyType
  /** `select` only: the allowed option labels. */
  options?: string[]
  /** `relation` only: Categories the picker constrains to. Omitted = unconstrained ("any"). */
  targetCategories?: Category[]
  /** `image` only: preview footprint. Default `medium` / `landscape`. */
  size?: ImageSize
  orientation?: ImageOrientation
}

/** Frontmatter is flat: a Custom Property's value is a scalar or a flat array of Slugs (for `relation`). */
export type CustomPropertyValue = string | string[] | number

export interface CustomProperty extends PropertyDef {
  value: CustomPropertyValue
}

/** A World-editable set of Custom Properties new Pages of a Category are born with. Seeds — never enforces. */
export interface CategoryTemplate {
  category: Category
  properties: PropertyDef[]
}

/**
 * One entity of the World. Shared Properties (title, category, tags, summary,
 * cover?, eras, created/updated) plus this Page's own Custom Properties,
 * which may freely diverge from its Category's template.
 */
export interface Page {
  slug: string
  category: Category
  title: string
  tags: string[]
  summary: string
  cover?: string
  /** Era Slugs this Page occupies. `[]` = Timeless. */
  eras: string[]
  created: string
  updated: string
  customProperties: CustomProperty[]
  body: string
}

/** One image per Era Slug for an era-linked Map; `all` for a single-image Map. */
export type MapImages = { [eraSlugOrAll: string]: string }

export interface WorldMap {
  id: string
  title: string
  eraLinked: boolean
  images: MapImages
  /** Set when this Map is a child, entered via a Pin on another Map. */
  parentMap?: string
  parentPin?: string
  /** The Library folder this Map is filed under; absent = the Library root. Purely organizational, independent of the parentMap/parentPin drill-down hierarchy. */
  folder?: string
}

/** A Library folder — an organizational drawer for Maps. Nestable; independent of the Map drill-down hierarchy. */
export interface MapFolder {
  id: string
  name: string
  /** The folder this one nests inside; absent = a top-level drawer at the Library root. */
  parentFolder?: string
}

/** A placement of a Page on a Map at percentage coordinates, narrowed to a subset of the Page's Eras. */
export interface Pin {
  id: string
  mapId: string
  pageSlug: string
  x: number
  y: number
  eras: string[]
  /** Set when this Pin opens a child Map. */
  childMap?: string
}

/**
 * The top-level container: its Pages, Era order, Category Templates, Maps
 * and Pins. Itself a Markdown artifact (`_world.md`).
 */
export interface World {
  slug: string
  name: string
  genre: string
  color: string
  logline: string
  /** Era Slugs, ordered; the timeline's sequence. */
  eraOrder: string[]
  /** Exactly one Era Slug, shared by the timeline and every Map. */
  activeEra: string
  /** The Map ID the "World map" entry opens. Skeleton Worlds may have none yet. */
  rootMap?: string
  categoryTemplates: CategoryTemplate[]
  maps: WorldMap[]
  pins: Pin[]
  /** Library folders that organize the Maps. Empty on Worlds that never filed a chart. */
  mapFolders: MapFolder[]
  /** World-scoped reference whiteboard. Absent on legacy fixtures; new Worlds start empty. */
  canvas?: ReferenceCanvas
  created: string
  updated: string
  body: string
}
