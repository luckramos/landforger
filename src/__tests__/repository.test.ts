import { beforeEach, describe, expect, it } from 'vitest'
import { pageToMarkdown } from '../domain/page'
import type { Page, World } from '../domain/types'
import { worldToMarkdown } from '../domain/world'
import { LocalStorageWorldRepository, type FixtureFiles } from '../repository/LocalStorageWorldRepository'
import { createInMemoryStorage } from './testStorage'

const baseWorld: World = {
  slug: 'testland',
  name: 'Testland',
  genre: 'Fantasy',
  color: 'oklch(0.68 0.1 38)',
  logline: 'A world for tests.',
  eraOrder: ['era-one'],
  activeEra: 'era-one',
  rootMap: undefined,
  categoryTemplates: [],
  maps: [],
  pins: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  body: 'Notes.\n',
}

const basePage: Page = {
  slug: 'alaric',
  category: 'characters',
  title: 'Alaric',
  tags: ['test'],
  summary: 'A test character.',
  eras: ['era-one'],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  customProperties: [],
  body: 'A character for tests.\n',
}

const baseEraPage: Page = {
  ...basePage,
  slug: 'era-one',
  category: 'eras',
  title: 'The First Era',
  eras: [],
}

const secondEraPage: Page = {
  ...baseEraPage,
  slug: 'era-two',
  title: 'The Second Era',
}

function fixturesFor(world: World, pages: Page[]): FixtureFiles {
  const files: FixtureFiles = { [`/src/fixtures/worlds/${world.slug}/_world.md`]: worldToMarkdown(world) }
  for (const page of pages) {
    files[`/src/fixtures/worlds/${world.slug}/${page.slug}.md`] = pageToMarkdown(page)
  }
  return files
}

let storage: Storage

beforeEach(() => {
  storage = createInMemoryStorage()
})

describe('LocalStorageWorldRepository — seeding', () => {
  it('seeds localStorage from fixtures on first load', async () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))
    expect((await repo.getWorld('testland'))?.name).toBe('Testland')
    expect((await repo.getPage('testland', 'alaric'))?.title).toBe('Alaric')
    expect(storage.getItem('landforger:seeded')).toBe('1')
  })

  it('reads localStorage only on subsequent loads, ignoring different fixtures', async () => {
    new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))

    // Mutate through a second repository instance sharing the same storage.
    const second = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))
    await second.updatePage('testland', 'alaric', { title: 'Alaric Renamed' })

    // A third instance, even given entirely different fixtures, must not re-seed.
    const differentWorld: World = { ...baseWorld, name: 'Should Not Appear' }
    const third = new LocalStorageWorldRepository(storage, fixturesFor(differentWorld, [basePage]))
    expect((await third.getWorld('testland'))?.name).toBe('Testland')
    expect((await third.getPage('testland', 'alaric'))?.title).toBe('Alaric Renamed')
  })

  it('starts with an empty world list when no fixtures are given', async () => {
    const repo = new LocalStorageWorldRepository(storage)
    expect(await repo.listWorlds()).toEqual([])
  })
})

describe('LocalStorageWorldRepository — Page CRUD', () => {
  function freshRepo() {
    return new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))
  }

  it('lists and gets pages as parsed Page objects, never raw frontmatter', async () => {
    const repo = freshRepo()
    const pages = await repo.listPages('testland')
    expect(pages).toHaveLength(1)
    expect(pages[0]).toEqual(basePage)
    expect(typeof pages[0]).not.toBe('string')
  })

  it('creates a page with a kebab-case slug generated from the title', async () => {
    const repo = freshRepo()
    const created = await repo.createPage('testland', { title: 'Corin Ashthorn', category: 'characters' })
    expect(created.slug).toBe('corin-ashthorn')
    expect(await repo.getPage('testland', 'corin-ashthorn')).toEqual(created)
  })

  it('seeds a new Page from its World current Category Template without sharing mutable definitions', async () => {
    const templatedWorld: World = {
      ...baseWorld,
      categoryTemplates: [
        {
          category: 'characters',
          properties: [
            { key: 'portrait', label: 'Portrait', type: 'image' },
            { key: 'age', label: 'Age', type: 'number' },
            { key: 'allies', label: 'Allies', type: 'relation', targetCategories: ['characters'] },
          ],
        },
      ],
    }
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(templatedWorld, []))

    const created = await repo.createPage('testland', { title: 'Mira', category: 'characters' })
    expect(created.customProperties).toEqual([
      { key: 'portrait', label: 'Portrait', type: 'image', value: '' },
      { key: 'age', label: 'Age', type: 'number', value: 0 },
      { key: 'allies', label: 'Allies', type: 'relation', targetCategories: ['characters'], value: [] },
    ])

    created.customProperties[2].value = ['alaric']
    expect((await repo.getWorld('testland'))?.categoryTemplates[0].properties[2]).not.toHaveProperty('value')
  })

  it('template edits affect future Pages only', async () => {
    const repo = freshRepo()
    const first = await repo.createPage('testland', { title: 'Before', category: 'characters' })
    await repo.updateWorld('testland', {
      categoryTemplates: [
        { category: 'characters', properties: [{ key: 'role', label: 'Role', type: 'text' }] },
      ],
    })
    const second = await repo.createPage('testland', { title: 'After', category: 'characters' })

    expect(first.customProperties).toEqual([])
    expect((await repo.getPage('testland', first.slug))?.customProperties).toEqual([])
    expect(second.customProperties).toEqual([{ key: 'role', label: 'Role', type: 'text', value: '' }])
  })

  it('resolves slug collisions with a numeric suffix', async () => {
    const repo = freshRepo()
    // The fixture already seeded a page titled "Alaric" (slug `alaric`).
    const first = await repo.createPage('testland', { title: 'Alaric', category: 'characters' })
    const second = await repo.createPage('testland', { title: 'Alaric', category: 'characters' })
    expect(first.slug).toBe('alaric-2')
    expect(second.slug).toBe('alaric-3')
  })

  it('stamps created and updated as ISO strings on creation', async () => {
    const repo = freshRepo()
    const created = await repo.createPage('testland', { title: 'New Page', category: 'events' })
    expect(created.created).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(created.updated).toBe(created.created)
  })

  it('renaming a page changes only the title — slug is immutable', async () => {
    const repo = freshRepo()
    const renamed = await repo.updatePage('testland', 'alaric', { title: 'Alaric the Bold' })
    expect(renamed.slug).toBe('alaric')
    expect(renamed.title).toBe('Alaric the Bold')
  })

  it('recategorizes with Properties intact and can optionally add missing target-template Properties', async () => {
    const world: World = {
      ...baseWorld,
      categoryTemplates: [
        {
          category: 'locations',
          properties: [
            { key: 'role', label: 'Location role', type: 'text' },
            { key: 'parent', label: 'Parent', type: 'relation', targetCategories: ['locations'] },
          ],
        },
      ],
    }
    const page: Page = {
      ...basePage,
      customProperties: [{ key: 'role', label: 'Character role', type: 'text', value: 'Scout' }],
    }
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(world, [page]))

    const changed = await repo.recategorizePage('testland', 'alaric', 'locations', { applyTemplate: true })
    expect(changed.category).toBe('locations')
    expect(changed.slug).toBe('alaric')
    expect(changed.customProperties).toEqual([
      { key: 'role', label: 'Character role', type: 'text', value: 'Scout' },
      { key: 'parent', label: 'Parent', type: 'relation', targetCategories: ['locations'], value: [] },
    ])
  })

  it('maintains updated on every mutation while created never changes', async () => {
    const repo = freshRepo()
    const before = (await repo.getPage('testland', 'alaric'))!
    const after = await repo.updatePage('testland', 'alaric', { summary: 'Updated summary.' })
    expect(after.created).toBe(before.created)
    expect(after.updated).not.toBe(before.updated)
  })

  it('ignores explicitly-undefined patch keys instead of blanking required Properties', async () => {
    const repo = freshRepo()
    const patched = await repo.updatePage('testland', 'alaric', { title: undefined, summary: 'New summary.' })
    expect(patched.title).toBe('Alaric')
    expect(patched.summary).toBe('New summary.')
    // Same rule at the World level.
    const world = await repo.updateWorld('testland', { name: undefined, activeEra: 'era-one' })
    expect(world.name).toBe('Testland')
  })

  it('deleting a page removes it but leaves other pages untouched (ghost-on-delete)', async () => {
    const repo = freshRepo()
    await repo.createPage('testland', { title: 'Bystander', category: 'characters' })
    await repo.deletePage('testland', 'alaric')
    expect(await repo.getPage('testland', 'alaric')).toBeUndefined()
    const remaining = await repo.listPages('testland')
    expect(remaining.map((p) => p.slug)).toEqual(['bystander'])
    expect(remaining[0].title).toBe('Bystander')
  })

  it('ghost reconnect: recreating a deleted slug reconnects references without any rewrites', async () => {
    const repo = freshRepo()
    await repo.createPage('testland', { title: 'Referencer', category: 'stories', body: 'See [[alaric]] for details.\n' })

    await repo.deletePage('testland', 'alaric')
    // The reference is now a Ghost link: the referencing body is untouched, the target is gone.
    expect((await repo.getPage('testland', 'referencer'))?.body).toContain('[[alaric]]')
    expect(await repo.getPage('testland', 'alaric')).toBeUndefined()

    // Recreating the same title regenerates the same slug — the Ghost link reconnects.
    const recreated = await repo.createPage('testland', { title: 'Alaric', category: 'characters' })
    expect(recreated.slug).toBe('alaric')
    expect((await repo.getPage('testland', 'referencer'))?.body).toContain('[[alaric]]')
    expect((await repo.getPage('testland', 'alaric'))?.title).toBe('Alaric')
  })

  it('exposes backlinks as a repository-derived view over body links and Relations', async () => {
    const repo = freshRepo()
    await repo.createPage('testland', {
      title: 'Chronicle',
      category: 'stories',
      body: 'The record names [[alaric]].',
    })
    await repo.createPage('testland', {
      title: 'The Watch',
      category: 'organizations',
      customProperties: [{ key: 'members', label: 'Members', type: 'relation', value: ['alaric'] }],
    })

    expect(await repo.getBacklinks('testland', 'alaric')).toEqual([
      expect.objectContaining({ sourceSlug: 'the-watch', kinds: ['relation'] }),
      expect.objectContaining({ sourceSlug: 'chronicle', kinds: ['body'] }),
    ])
  })

  it('re-derives the live Relation seam after an edit', async () => {
    const repo = freshRepo()
    const source = await repo.createPage('testland', {
      title: 'The Watch',
      category: 'organizations',
      customProperties: [{ key: 'members', label: 'Members', type: 'relation', value: [] }],
    })
    expect(await repo.getBacklinks('testland', 'alaric')).not.toContainEqual(
      expect.objectContaining({ sourceSlug: source.slug }),
    )

    await repo.updatePage('testland', source.slug, {
      customProperties: [{ key: 'members', label: 'Members', type: 'relation', value: ['alaric'] }],
    })
    expect(await repo.getBacklinks('testland', 'alaric')).toContainEqual(
      expect.objectContaining({ sourceSlug: source.slug, kinds: ['relation'] }),
    )
  })

  it('keeps Era order and Active Era valid across create, recategorize and delete', async () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage, baseEraPage]))
    const era = await repo.createPage('testland', { title: 'Second Era', category: 'eras' })
    expect(await repo.getWorld('testland')).toEqual(
      expect.objectContaining({ eraOrder: ['era-one', era.slug], activeEra: 'era-one' }),
    )

    const converted = await repo.createPage('testland', { title: 'Third Age', category: 'events' })
    await repo.recategorizePage('testland', converted.slug, 'eras')
    expect((await repo.getWorld('testland'))?.eraOrder).toEqual(['era-one', era.slug, converted.slug])

    await repo.recategorizePage('testland', converted.slug, 'events')
    expect((await repo.getWorld('testland'))?.eraOrder).toEqual(['era-one', era.slug])

    await repo.updateWorld('testland', { activeEra: era.slug })
    await repo.deletePage('testland', era.slug)
    expect(await repo.getWorld('testland')).toEqual(
      expect.objectContaining({ eraOrder: ['era-one'], activeEra: 'era-one' }),
    )
  })
})

describe('LocalStorageWorldRepository — World mutations', () => {
  it('persists era order, active era, templates, maps and pins via updateWorld', async () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage, baseEraPage, secondEraPage]))
    const updated = await repo.updateWorld('testland', {
      eraOrder: ['era-one', 'era-two'],
      activeEra: 'era-two',
    })
    expect(updated.eraOrder).toEqual(['era-one', 'era-two'])
    expect(updated.activeEra).toBe('era-two')
    expect((await repo.getWorld('testland'))?.activeEra).toBe('era-two')
  })

  it('can explicitly clear the optional Root Map', async () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage, baseEraPage]))
    await repo.updateWorld('testland', {
      rootMap: 'old-map',
      maps: [{ id: 'old-map', title: 'Old Map', eraLinked: false, images: {} }],
    })
    await repo.updateWorld('testland', { rootMap: null })
    expect((await repo.getWorld('testland'))?.rootMap).toBeUndefined()
  })

  it('defaults an invalid Active Era to the last Era and keeps it across repository reloads', async () => {
    const world = { ...baseWorld, eraOrder: ['era-one', 'era-two'], activeEra: 'missing-era' }
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(world, [basePage, baseEraPage, secondEraPage]))

    expect((await repo.getWorld('testland'))?.activeEra).toBe('era-two')
    const reloaded = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage, baseEraPage, secondEraPage]))
    expect((await reloaded.getWorld('testland'))?.activeEra).toBe('era-two')
  })

  it('never treats a non-Era Page in eraOrder as the Active Era', async () => {
    const world = { ...baseWorld, eraOrder: ['era-one', 'alaric'], activeEra: 'alaric' }
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(world, [basePage, baseEraPage]))

    expect((await repo.getWorld('testland'))?.activeEra).toBe('era-one')
  })

  it('persists reordered Eras while preserving the current Active Era', async () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage, baseEraPage, secondEraPage]))
    await repo.updateWorld('testland', { eraOrder: ['era-two', 'era-one'] })

    const reloaded = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage, baseEraPage, secondEraPage]))
    expect((await reloaded.getWorld('testland'))?.eraOrder).toEqual(['era-two', 'era-one'])
    expect((await reloaded.getWorld('testland'))?.activeEra).toBe('era-one')
  })

  it('adds newly created Era Pages to the timeline and removes deleted Eras from it', async () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage, baseEraPage]))
    const created = await repo.createPage('testland', {
      title: 'The Second Era',
      category: 'eras',
      customProperties: [{ key: 'datelabel', label: 'Date Label', type: 'text', value: 'After the test' }],
    })
    expect((await repo.getWorld('testland'))?.eraOrder).toEqual(['era-one', created.slug])

    await repo.deletePage('testland', 'era-one')
    expect(await repo.getWorld('testland')).toMatchObject({ eraOrder: [created.slug], activeEra: created.slug })
  })

  it('keeps the timeline coherent when a Page changes to or from the Eras Category', async () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage, baseEraPage]))
    const promoted = await repo.createPage('testland', { title: 'Promoted Chapter', category: 'events' })

    await repo.updatePage('testland', promoted.slug, { category: 'eras' })
    expect((await repo.getWorld('testland'))?.eraOrder).toEqual(['era-one', promoted.slug])

    await repo.updatePage('testland', promoted.slug, { category: 'events' })
    expect(await repo.getWorld('testland')).toMatchObject({ eraOrder: ['era-one'], activeEra: 'era-one' })
  })

  it('notifies subscribers whenever a repository mutation starts', async () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))
    const mutations: string[] = []
    const unsubscribe = repo.subscribeToMutations((mutation) => mutations.push(mutation.kind))

    await repo.updatePage('testland', 'alaric', { summary: 'Changed.' })
    await repo.updateWorld('testland', { activeEra: 'era-one' })
    await repo.createPage('testland', { title: 'New Place', category: 'locations' })
    await repo.deletePage('testland', 'new-place')

    expect(mutations).toEqual(['updatePage', 'updateWorld', 'createPage', 'deletePage'])
    unsubscribe()
    await repo.updatePage('testland', 'alaric', { summary: 'Changed again.' })
    expect(mutations).toHaveLength(4)
  })
})
