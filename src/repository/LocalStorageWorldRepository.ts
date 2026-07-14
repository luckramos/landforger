import { pageFromMarkdown, pageToMarkdown } from '../domain/page'
import { deriveBacklinks, type Backlink } from '../domain/backlinks'
import { resolveSlugCollision, slugify } from '../domain/slug'
import type { CategoryTemplate, Page, World } from '../domain/types'
import { worldFromMarkdown, worldToMarkdown } from '../domain/world'
import type {
  CreatePageInput,
  CreateWorldInput,
  RepositoryMutation,
  UpdatePageInput,
  WorldMutationInput,
  WorldRepository,
} from './WorldRepository'

/**
 * The design's per-Category `createSchemas` (design-inventory.md §2.3), seeded onto a
 * new World when `createWorld` is called with `template: 'starter'`. Matches the
 * Category Templates every shipped fixture World already carries.
 */
const DEFAULT_CATEGORY_TEMPLATES: CategoryTemplate[] = [
  {
    category: 'characters',
    properties: [
      { key: 'aliases', label: 'Aliases', type: 'text' },
      { key: 'portrait', label: 'Portrait', type: 'image' },
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'affiliations', label: 'Affiliations', type: 'relation', targetCategories: ['organizations'] },
      { key: 'origin', label: 'Origin', type: 'relation', targetCategories: ['locations'] },
    ],
  },
  {
    category: 'locations',
    properties: [
      { key: 'type', label: 'Type', type: 'select', options: ['City', 'Region', 'Building', 'Landmark', 'Wilds'] },
      { key: 'parent', label: 'Parent', type: 'relation', targetCategories: ['locations'] },
      { key: 'inhabitants', label: 'Inhabitants', type: 'relation', targetCategories: ['characters'] },
    ],
  },
  {
    category: 'events',
    properties: [
      { key: 'period', label: 'Period', type: 'text' },
      { key: 'participants', label: 'Participants', type: 'relation' },
      { key: 'place', label: 'Place', type: 'relation', targetCategories: ['locations'] },
      { key: 'consequences', label: 'Consequences', type: 'textarea' },
    ],
  },
  {
    category: 'stories',
    properties: [
      { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'In progress', 'Complete'] },
      { key: 'synopsis', label: 'Synopsis', type: 'textarea' },
      { key: 'cast', label: 'Cast', type: 'relation', targetCategories: ['characters'] },
    ],
  },
  {
    category: 'items',
    properties: [
      { key: 'type', label: 'Type', type: 'select', options: ['Artifact', 'Weapon', 'Material', 'Relic', 'Everyday'] },
      { key: 'owner', label: 'Owner', type: 'relation', targetCategories: ['characters'] },
      { key: 'origin', label: 'Origin', type: 'relation', targetCategories: ['locations'] },
    ],
  },
  {
    category: 'eras',
    properties: [{ key: 'datelabel', label: 'Date Label', type: 'text' }],
  },
  {
    category: 'organizations',
    properties: [
      { key: 'type', label: 'Type', type: 'select', options: ['Guild', 'Order', 'House', 'Cult', 'State'] },
      { key: 'leader', label: 'Leader', type: 'relation', targetCategories: ['characters'] },
      { key: 'hq', label: 'HQ', type: 'relation', targetCategories: ['locations'] },
      { key: 'members', label: 'Members', type: 'relation', targetCategories: ['characters'] },
    ],
  },
]

/** Shape produced by `import.meta.glob('.../fixtures/worlds/**\/*.md', { query: '?raw', import: 'default', eager: true })`. */
export type FixtureFiles = Record<string, string>

const SEED_MARKER_KEY = 'landforger:seeded'
const WORLDS_INDEX_KEY = 'landforger:worlds'

const worldKey = (worldSlug: string) => `landforger:world:${worldSlug}`
const pagesIndexKey = (worldSlug: string) => `landforger:world:${worldSlug}:pages`
const pageKey = (worldSlug: string, pageSlug: string) => `landforger:world:${worldSlug}:page:${pageSlug}`

const FIXTURE_PATH = /worlds\/([^/]+)\/([^/]+)\.md$/

/**
 * Drops keys whose value is explicitly `undefined` so `{ ...entity, ...patch }`
 * can never blank a required Property (e.g. `updatePage(slug, { title: undefined })`).
 */
function withoutUndefined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>
}

/**
 * `WorldRepository` over `localStorage`, seeded on first load from fixture
 * `.md` files. After the seed marker is set, every read/write goes through
 * `localStorage` only — fixtures are never consulted again, so mutations
 * (including in other tabs/reloads) persist across the session.
 */
export class LocalStorageWorldRepository implements WorldRepository {
  private readonly mutationListeners = new Set<(mutation: RepositoryMutation) => void>()

  constructor(
    private readonly storage: Storage = globalThis.localStorage,
    fixtures?: FixtureFiles,
  ) {
    this.ensureSeeded(fixtures)
  }

  subscribeToMutations(listener: (mutation: RepositoryMutation) => void): () => void {
    this.mutationListeners.add(listener)
    return () => this.mutationListeners.delete(listener)
  }

  private notifyMutation(mutation: RepositoryMutation): void {
    for (const listener of this.mutationListeners) listener(mutation)
  }

  private ensureSeeded(fixtures?: FixtureFiles): void {
    if (this.storage.getItem(SEED_MARKER_KEY)) return

    const worldSlugs: string[] = []
    const pageSlugsByWorld = new Map<string, string[]>()

    for (const [path, content] of Object.entries(fixtures ?? {})) {
      const match = path.match(FIXTURE_PATH)
      if (!match) continue
      const [, worldSlug, fileBase] = match
      if (!worldSlugs.includes(worldSlug)) worldSlugs.push(worldSlug)

      if (fileBase === '_world') {
        this.storage.setItem(worldKey(worldSlug), content)
      } else {
        this.storage.setItem(pageKey(worldSlug, fileBase), content)
        const pageSlugs = pageSlugsByWorld.get(worldSlug) ?? []
        pageSlugs.push(fileBase)
        pageSlugsByWorld.set(worldSlug, pageSlugs)
      }
    }

    for (const [worldSlug, pageSlugs] of pageSlugsByWorld.entries()) {
      this.storage.setItem(pagesIndexKey(worldSlug), JSON.stringify(pageSlugs.sort()))
    }
    worldSlugs.sort()
    this.storage.setItem(WORLDS_INDEX_KEY, JSON.stringify(worldSlugs))
    this.storage.setItem(SEED_MARKER_KEY, '1')
  }

  private worldSlugs(): string[] {
    const raw = this.storage.getItem(WORLDS_INDEX_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  }

  private readWorld(worldSlug: string): World | undefined {
    const raw = this.storage.getItem(worldKey(worldSlug))
    return raw ? worldFromMarkdown(raw) : undefined
  }

  private writeWorld(world: World): void {
    this.storage.setItem(worldKey(world.slug), worldToMarkdown(world))
  }

  async listWorlds(): Promise<World[]> {
    return this.worldSlugs()
      .map((slug) => this.readWorld(slug))
      .filter((world): world is World => world !== undefined)
  }

  async getWorld(worldSlug: string): Promise<World | undefined> {
    return this.readWorld(worldSlug)
  }

  async updateWorld(worldSlug: string, patch: WorldMutationInput): Promise<World> {
    const world = this.readWorld(worldSlug)
    if (!world) throw new Error(`No such World: ${worldSlug}`)
    this.notifyMutation({ kind: 'updateWorld', worldSlug })
    const updated: World = {
      ...world,
      ...withoutUndefined(patch),
      slug: world.slug,
      created: world.created,
      updated: new Date().toISOString(),
    }
    this.writeWorld(updated)
    return updated
  }

  async createWorld(input: CreateWorldInput): Promise<World> {
    const existingSlugs = this.worldSlugs()
    const slug = resolveSlugCollision(slugify(input.name), existingSlugs)
    this.notifyMutation({ kind: 'createWorld', worldSlug: slug })
    const now = new Date().toISOString()
    const world: World = {
      slug,
      name: input.name,
      genre: input.genre,
      color: input.color,
      logline: input.logline ?? '',
      eraOrder: [],
      activeEra: '',
      categoryTemplates: input.template === 'starter' ? structuredClone(DEFAULT_CATEGORY_TEMPLATES) : [],
      maps: [],
      pins: [],
      created: now,
      updated: now,
      body: '',
    }
    this.writeWorld(world)
    this.storage.setItem(WORLDS_INDEX_KEY, JSON.stringify([...existingSlugs, slug].sort()))
    this.writePageSlugs(slug, [])
    return world
  }

  private pageSlugs(worldSlug: string): string[] {
    const raw = this.storage.getItem(pagesIndexKey(worldSlug))
    return raw ? (JSON.parse(raw) as string[]) : []
  }

  private writePageSlugs(worldSlug: string, slugs: string[]): void {
    this.storage.setItem(pagesIndexKey(worldSlug), JSON.stringify(slugs))
  }

  private readPage(worldSlug: string, pageSlug: string): Page | undefined {
    const raw = this.storage.getItem(pageKey(worldSlug, pageSlug))
    return raw ? pageFromMarkdown(raw) : undefined
  }

  private writePage(worldSlug: string, page: Page): void {
    this.storage.setItem(pageKey(worldSlug, page.slug), pageToMarkdown(page))
  }

  async listPages(worldSlug: string): Promise<Page[]> {
    return this.pageSlugs(worldSlug)
      .map((slug) => this.readPage(worldSlug, slug))
      .filter((page): page is Page => page !== undefined)
  }

  async getPage(worldSlug: string, pageSlug: string): Promise<Page | undefined> {
    return this.readPage(worldSlug, pageSlug)
  }

  async getBacklinks(worldSlug: string, pageSlug: string): Promise<Backlink[]> {
    return deriveBacklinks(await this.listPages(worldSlug), pageSlug)
  }

  async createPage(worldSlug: string, input: CreatePageInput): Promise<Page> {
    const existingSlugs = this.pageSlugs(worldSlug)
    const slug = resolveSlugCollision(slugify(input.title), existingSlugs)
    this.notifyMutation({ kind: 'createPage', worldSlug, pageSlug: slug })
    const now = new Date().toISOString()
    const page: Page = {
      slug,
      category: input.category,
      title: input.title,
      tags: input.tags ?? [],
      summary: input.summary ?? '',
      ...(input.cover !== undefined ? { cover: input.cover } : {}),
      eras: input.eras ?? [],
      created: now,
      updated: now,
      customProperties: input.customProperties ?? [],
      body: input.body ?? '',
    }
    this.writePage(worldSlug, page)
    this.writePageSlugs(worldSlug, [...existingSlugs, slug])
    return page
  }

  async updatePage(worldSlug: string, pageSlug: string, patch: UpdatePageInput): Promise<Page> {
    const page = this.readPage(worldSlug, pageSlug)
    if (!page) throw new Error(`No such Page: ${worldSlug}/${pageSlug}`)
    this.notifyMutation({ kind: 'updatePage', worldSlug, pageSlug })
    const updated: Page = {
      ...page,
      ...withoutUndefined(patch),
      slug: page.slug,
      created: page.created,
      updated: new Date().toISOString(),
    }
    this.writePage(worldSlug, updated)
    return updated
  }

  async deletePage(worldSlug: string, pageSlug: string): Promise<void> {
    this.notifyMutation({ kind: 'deletePage', worldSlug, pageSlug })
    this.storage.removeItem(pageKey(worldSlug, pageSlug))
    this.writePageSlugs(
      worldSlug,
      this.pageSlugs(worldSlug).filter((slug) => slug !== pageSlug),
    )
  }
}
