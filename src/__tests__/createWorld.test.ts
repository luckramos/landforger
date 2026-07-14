import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIES } from '../domain/types'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { createInMemoryStorage } from './testStorage'

let storage: Storage
let repo: LocalStorageWorldRepository

beforeEach(() => {
  storage = createInMemoryStorage()
  repo = new LocalStorageWorldRepository(storage)
})

describe('LocalStorageWorldRepository — createWorld', () => {
  it('creates a blank world with a slug generated from the name', async () => {
    const world = await repo.createWorld({
      name: 'The Ninth Vale',
      logline: 'A drowned coast.',
      genre: 'Fantasy',
      color: 'oklch(0.8 0.085 38)',
      template: 'blank',
    })
    expect(world.slug).toBe('the-ninth-vale')
    expect(world.eraOrder).toEqual([])
    expect(world.activeEra).toBe('')
    expect(world.categoryTemplates).toEqual([])
    expect(world.maps).toEqual([])
    expect(world.pins).toEqual([])
    expect(world.created).toBe(world.updated)
    expect(await repo.listPages('the-ninth-vale')).toEqual([])
  })

  it('starter template seeds the default Category Templates for all 7 categories', async () => {
    const world = await repo.createWorld({
      name: 'Starterland',
      genre: 'Mythic',
      color: 'oklch(0.8 0.085 150)',
      template: 'starter',
    })
    expect(world.categoryTemplates.map((t) => t.category).sort()).toEqual([...CATEGORIES].sort())
    const characters = world.categoryTemplates.find((t) => t.category === 'characters')!
    expect(characters.properties.map((p) => p.key)).toEqual(['aliases', 'portrait', 'age', 'role', 'affiliations', 'origin'])
    // Starter copies templates only — no Pages are created.
    expect(await repo.listPages('starterland')).toEqual([])
  })

  it('persists through the markdown round-trip: a second repository over the same storage reads it back', async () => {
    await repo.createWorld({ name: 'Gloamreach', genre: 'Custom', color: '#8a5cf5', template: 'starter', logline: 'Dusk city.' })
    const second = new LocalStorageWorldRepository(storage)
    const found = (await second.listWorlds()).find((w) => w.slug === 'gloamreach')
    expect(found?.name).toBe('Gloamreach')
    expect(found?.color).toBe('#8a5cf5')
    expect(found?.logline).toBe('Dusk city.')
    expect(found?.categoryTemplates).toHaveLength(7)
  })

  it('resolves world slug collisions with a numeric suffix', async () => {
    const first = await repo.createWorld({ name: 'Echo', genre: 'Fantasy', color: 'oklch(0.8 0.085 38)', template: 'blank' })
    const second = await repo.createWorld({ name: 'Echo', genre: 'Fantasy', color: 'oklch(0.8 0.085 38)', template: 'blank' })
    expect(first.slug).toBe('echo')
    expect(second.slug).toBe('echo-2')
    expect((await repo.listWorlds()).map((w) => w.slug)).toEqual(['echo', 'echo-2'])
  })

  it('mutating a starter world\'s templates never bleeds into later starter worlds', async () => {
    const first = await repo.createWorld({ name: 'One', genre: 'Fantasy', color: 'x', template: 'starter' })
    await repo.updateWorld(first.slug, { categoryTemplates: [] })
    const second = await repo.createWorld({ name: 'Two', genre: 'Fantasy', color: 'x', template: 'starter' })
    expect(second.categoryTemplates).toHaveLength(7)
  })
})
