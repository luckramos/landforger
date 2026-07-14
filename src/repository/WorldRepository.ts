import type { Page, World } from '../domain/types'
import type { Backlink } from '../domain/backlinks'

/** Slug is generated (never supplied); `created`/`updated` are system-maintained. */
export type CreatePageInput = Pick<Page, 'title' | 'category'> &
  Partial<Omit<Page, 'slug' | 'title' | 'category' | 'created' | 'updated'>>

/** Everything but `slug` (immutable) and `created`/`updated` (system-maintained). */
export type UpdatePageInput = Partial<Omit<Page, 'slug' | 'created' | 'updated'>>

/** World-level mutations: era order, Category Templates, Maps & Pins, Active Era, and world meta. */
export type WorldMutationInput = Partial<Omit<World, 'slug' | 'created' | 'updated'>>

/** `'starter'` seeds the default per-Category Templates (design's `createSchemas`); `'blank'` starts empty. */
export type CreateWorldTemplate = 'blank' | 'starter'

/** Slug is generated (never supplied); a fresh World starts with no Eras, Maps, Pins, or body. */
export interface CreateWorldInput {
  name: string
  /** The one-line premise shown on the World card. Defaults to `''`. */
  logline?: string
  /** Free-text genre label (a preset like "Fantasy", or "Custom"). */
  genre: string
  /** Any valid CSS color — a preset genre color or a user-picked custom one. */
  color: string
  template: CreateWorldTemplate
}

export type RepositoryMutationKind = 'createWorld' | 'updateWorld' | 'createPage' | 'updatePage' | 'deletePage'

export interface RepositoryMutation {
  kind: RepositoryMutationKind
  worldSlug: string
  pageSlug?: string
}

/**
 * The app's single data seam: Worlds and Pages as Markdown documents.
 * Callers never see raw frontmatter — every method takes and returns
 * parsed domain objects; `toMarkdown`/`fromMarkdown` (see `domain/page.ts`
 * and `domain/world.ts`) are internal to the implementation.
 *
 * Every method is async so a future backend or filesystem implementation
 * can replace `LocalStorageWorldRepository` without rewriting call sites.
 */
export interface WorldRepository {
  /** Observe mutation starts; used by shell-level feedback without coupling screens to storage. */
  subscribeToMutations(listener: (mutation: RepositoryMutation) => void): () => void
  listWorlds(): Promise<World[]>
  getWorld(worldSlug: string): Promise<World | undefined>
  /** Persists world-level mutations (era order, templates, maps & pins, active era, meta). */
  updateWorld(worldSlug: string, patch: WorldMutationInput): Promise<World>
  /** Slug is generated from `name` (kebab-case, collision-suffixed) — never provided by the caller. */
  createWorld(input: CreateWorldInput): Promise<World>

  listPages(worldSlug: string): Promise<Page[]>
  getPage(worldSlug: string, pageSlug: string): Promise<Page | undefined>
  /** Derived inverse references; recalculated from current Page Markdown and Properties. */
  getBacklinks(worldSlug: string, pageSlug: string): Promise<Backlink[]>
  /** Slug is generated from `title` (kebab-case, collision-suffixed) — never provided by the caller. */
  createPage(worldSlug: string, input: CreatePageInput): Promise<Page>
  updatePage(worldSlug: string, pageSlug: string, patch: UpdatePageInput): Promise<Page>
  /** Leaves references to this Page as Ghost links — deletion never rewrites other Pages. */
  deletePage(worldSlug: string, pageSlug: string): Promise<void>
}
