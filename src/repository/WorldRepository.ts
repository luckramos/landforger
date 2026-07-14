import type { Category, CategoryTemplate, CustomProperty, Page, Pin, World, WorldMap } from '../domain/types'

export interface CreatePageInput {
  title: string
  category: Category
  tags?: string[]
  summary?: string
  cover?: string
  eras?: string[]
  customProperties?: CustomProperty[]
  body?: string
}

/** Everything but `slug` (immutable), `created`/`updated` (system-maintained). */
export interface UpdatePageInput {
  title?: string
  category?: Category
  tags?: string[]
  summary?: string
  cover?: string
  eras?: string[]
  customProperties?: CustomProperty[]
  body?: string
}

/** World-level mutations: era order, Category Templates, Maps & Pins, Active Era, and world meta. */
export interface WorldMutationInput {
  name?: string
  genre?: string
  color?: string
  logline?: string
  eraOrder?: string[]
  activeEra?: string
  rootMap?: string
  categoryTemplates?: CategoryTemplate[]
  maps?: WorldMap[]
  pins?: Pin[]
  body?: string
}

/**
 * The app's single data seam: Worlds and Pages as Markdown documents.
 * Callers never see raw frontmatter — every method takes and returns
 * parsed domain objects; `toMarkdown`/`fromMarkdown` (see `domain/page.ts`
 * and `domain/world.ts`) are internal to the implementation.
 */
export interface WorldRepository {
  listWorlds(): World[]
  getWorld(worldSlug: string): World | undefined
  /** Persists world-level mutations (era order, templates, maps & pins, active era, meta). */
  updateWorld(worldSlug: string, patch: WorldMutationInput): World

  listPages(worldSlug: string): Page[]
  getPage(worldSlug: string, pageSlug: string): Page | undefined
  /** Slug is generated from `title` (kebab-case, collision-suffixed) — never provided by the caller. */
  createPage(worldSlug: string, input: CreatePageInput): Page
  updatePage(worldSlug: string, pageSlug: string, patch: UpdatePageInput): Page
  /** Leaves references to this Page as Ghost links — deletion never rewrites other Pages. */
  deletePage(worldSlug: string, pageSlug: string): void
}
