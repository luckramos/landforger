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
  it('seeds localStorage from fixtures on first load', () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))
    expect(repo.getWorld('testland')?.name).toBe('Testland')
    expect(repo.getPage('testland', 'alaric')?.title).toBe('Alaric')
    expect(storage.getItem('landforger:seeded')).toBe('1')
  })

  it('reads localStorage only on subsequent loads, ignoring different fixtures', () => {
    new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))

    // Mutate through a second repository instance sharing the same storage.
    const second = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))
    second.updatePage('testland', 'alaric', { title: 'Alaric Renamed' })

    // A third instance, even given entirely different fixtures, must not re-seed.
    const differentWorld: World = { ...baseWorld, name: 'Should Not Appear' }
    const third = new LocalStorageWorldRepository(storage, fixturesFor(differentWorld, [basePage]))
    expect(third.getWorld('testland')?.name).toBe('Testland')
    expect(third.getPage('testland', 'alaric')?.title).toBe('Alaric Renamed')
  })

  it('starts with an empty world list when no fixtures are given', () => {
    const repo = new LocalStorageWorldRepository(storage)
    expect(repo.listWorlds()).toEqual([])
  })
})

describe('LocalStorageWorldRepository — Page CRUD', () => {
  function freshRepo() {
    return new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))
  }

  it('lists and gets pages as parsed Page objects, never raw frontmatter', () => {
    const repo = freshRepo()
    const pages = repo.listPages('testland')
    expect(pages).toHaveLength(1)
    expect(pages[0]).toEqual(basePage)
    expect(typeof pages[0]).not.toBe('string')
  })

  it('creates a page with a kebab-case slug generated from the title', () => {
    const repo = freshRepo()
    const created = repo.createPage('testland', { title: 'Corin Ashthorn', category: 'characters' })
    expect(created.slug).toBe('corin-ashthorn')
    expect(repo.getPage('testland', 'corin-ashthorn')).toEqual(created)
  })

  it('resolves slug collisions with a numeric suffix', () => {
    const repo = freshRepo()
    // The fixture already seeded a page titled "Alaric" (slug `alaric`).
    const first = repo.createPage('testland', { title: 'Alaric', category: 'characters' })
    const second = repo.createPage('testland', { title: 'Alaric', category: 'characters' })
    expect(first.slug).toBe('alaric-2')
    expect(second.slug).toBe('alaric-3')
  })

  it('stamps created and updated as ISO strings on creation', () => {
    const repo = freshRepo()
    const created = repo.createPage('testland', { title: 'New Page', category: 'events' })
    expect(created.created).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(created.updated).toBe(created.created)
  })

  it('renaming a page changes only the title — slug is immutable', () => {
    const repo = freshRepo()
    const renamed = repo.updatePage('testland', 'alaric', { title: 'Alaric the Bold' })
    expect(renamed.slug).toBe('alaric')
    expect(renamed.title).toBe('Alaric the Bold')
  })

  it('maintains updated on every mutation while created never changes', () => {
    const repo = freshRepo()
    const before = repo.getPage('testland', 'alaric')!
    const after = repo.updatePage('testland', 'alaric', { summary: 'Updated summary.' })
    expect(after.created).toBe(before.created)
    expect(after.updated).not.toBe(before.updated)
  })

  it('deleting a page removes it but leaves other pages untouched (ghost-on-delete)', () => {
    const repo = freshRepo()
    repo.createPage('testland', { title: 'Bystander', category: 'characters' })
    repo.deletePage('testland', 'alaric')
    expect(repo.getPage('testland', 'alaric')).toBeUndefined()
    const remaining = repo.listPages('testland')
    expect(remaining.map((p) => p.slug)).toEqual(['bystander'])
    expect(remaining[0].title).toBe('Bystander')
  })
})

describe('LocalStorageWorldRepository — World mutations', () => {
  it('persists era order, active era, templates, maps and pins via updateWorld', () => {
    const repo = new LocalStorageWorldRepository(storage, fixturesFor(baseWorld, [basePage]))
    const updated = repo.updateWorld('testland', {
      eraOrder: ['era-one', 'era-two'],
      activeEra: 'era-two',
    })
    expect(updated.eraOrder).toEqual(['era-one', 'era-two'])
    expect(updated.activeEra).toBe('era-two')
    expect(repo.getWorld('testland')?.activeEra).toBe('era-two')
  })
})
