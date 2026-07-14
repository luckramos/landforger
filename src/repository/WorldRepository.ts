import type { Page, World } from '../domain/types'

/** Slug is generated (never supplied); `created`/`updated` are system-maintained. */
export type CreatePageInput = Pick<Page, 'title' | 'category'> &
  Partial<Omit<Page, 'slug' | 'title' | 'category' | 'created' | 'updated'>>

/** Everything but `slug` (immutable) and `created`/`updated` (system-maintained). */
export type UpdatePageInput = Partial<Omit<Page, 'slug' | 'created' | 'updated'>>

/** World-level mutations: era order, Category Templates, Maps & Pins, Active Era, and world meta. */
export type WorldMutationInput = Partial<Omit<World, 'slug' | 'created' | 'updated'>>

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
  listWorlds(): Promise<World[]>
  getWorld(worldSlug: string): Promise<World | undefined>
  /** Persists world-level mutations (era order, templates, maps & pins, active era, meta). */
  updateWorld(worldSlug: string, patch: WorldMutationInput): Promise<World>

  listPages(worldSlug: string): Promise<Page[]>
  getPage(worldSlug: string, pageSlug: string): Promise<Page | undefined>
  /** Slug is generated from `title` (kebab-case, collision-suffixed) — never provided by the caller. */
  createPage(worldSlug: string, input: CreatePageInput): Promise<Page>
  updatePage(worldSlug: string, pageSlug: string, patch: UpdatePageInput): Promise<Page>
  /** Leaves references to this Page as Ghost links — deletion never rewrites other Pages. */
  deletePage(worldSlug: string, pageSlug: string): Promise<void>
}
