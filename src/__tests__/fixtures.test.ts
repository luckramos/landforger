import { beforeAll, describe, expect, it } from 'vitest'
import { CATEGORIES } from '../domain/types'
import type { Page, World } from '../domain/types'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { createInMemoryStorage } from './testStorage'

// Every shipped fixture, parsed through the repository layer exactly as
// the real app would on first load. This doubles as parser validation:
// if any fixture file were malformed, seeding here would throw.
const repo = new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles)

let worlds: World[]
let pagesByWorld: Map<string, Page[]>

beforeAll(async () => {
  worlds = await repo.listWorlds()
  pagesByWorld = new Map()
  for (const world of worlds) {
    pagesByWorld.set(world.slug, await repo.listPages(world.slug))
  }
})

const WIKILINK = /\[\[([a-z0-9-]+)\]\]/g

function allWikilinks(body: string): string[] {
  return Array.from(body.matchAll(WIKILINK), (m) => m[1])
}

describe('fixtures — seeded worlds', () => {
  it('ships The Ninth Vale, Marrowmoor, and Aeon Drift', () => {
    const slugs = worlds.map((w) => w.slug)
    expect(slugs).toEqual(expect.arrayContaining(['ninth-vale', 'marrowmoor', 'aeon-drift']))
  })

  it('The Ninth Vale ships ~25-30 pages', () => {
    const pages = pagesByWorld.get('ninth-vale')!
    expect(pages.length).toBeGreaterThanOrEqual(25)
    expect(pages.length).toBeLessThanOrEqual(30)
  })

  it('every fixture parses cleanly with no missing required Properties', () => {
    for (const world of worlds) {
      expect(world.slug).not.toBe('')
      expect(world.name).not.toBe('')
      for (const page of pagesByWorld.get(world.slug)!) {
        expect(page.slug).not.toBe('')
        expect(page.title).not.toBe('')
        expect(CATEGORIES).toContain(page.category)
      }
    }
  })

  it('seeds the reference canvas with the Ninth Vale mood-board examples', () => {
    const canvas = worlds.find((world) => world.slug === 'ninth-vale')?.canvas
    expect(canvas?.items).toHaveLength(4)
    expect(canvas?.items.every((item) => item.kind === 'text' || item.kind === 'sticky')).toBe(true)
    expect(canvas?.links).toEqual([])
  })
})

describe('fixtures — no pipe tables or code fences in any body (all worlds)', () => {
  it('rejects code fences', () => {
    for (const world of worlds) {
      for (const page of pagesByWorld.get(world.slug)!) {
        expect(page.body, `${world.slug}/${page.slug}`).not.toMatch(/```/)
      }
      expect(world.body, `${world.slug}/_world`).not.toMatch(/```/)
    }
  })

  it('rejects pipe-table rows', () => {
    for (const world of worlds) {
      for (const page of pagesByWorld.get(world.slug)!) {
        expect(page.body, `${world.slug}/${page.slug}`).not.toMatch(/^\s*\|.*\|\s*$/m)
      }
    }
  })

  it('never uses the rejected [[slug|Label]] display-label syntax (ADR 0001)', () => {
    for (const world of worlds) {
      for (const page of pagesByWorld.get(world.slug)!) {
        expect(page.body, `${world.slug}/${page.slug}`).not.toMatch(/\[\[[^\]]*\|[^\]]*\]\]/)
      }
    }
  })
})

describe('fixtures — the 9 mandatory coverage items (The Ninth Vale)', () => {
  let world: World
  let pages: Page[]

  beforeAll(async () => {
    world = (await repo.getWorld('ninth-vale'))!
    pages = pagesByWorld.get('ninth-vale')!
  })

  it('1. a page has multiple pins on the same map narrowed to different eras (Sera moves)', () => {
    const byPageAndMap = new Map<string, typeof world.pins>()
    for (const pin of world.pins) {
      const key = `${pin.pageSlug}@${pin.mapId}`
      byPageAndMap.set(key, [...(byPageAndMap.get(key) ?? []), pin])
    }
    const moving = Array.from(byPageAndMap.entries()).find(
      ([, pins]) => pins.length > 1 && new Set(pins.map((p) => JSON.stringify(p.eras))).size > 1,
    )
    expect(moving).toBeDefined()
    expect(moving?.[0]).toBe('sera@duskwater')
  })

  it('2. a Timeless pinned page exists (eras: [] but has at least one Pin)', () => {
    const pinnedSlugs = new Set(world.pins.map((p) => p.pageSlug))
    const timelessPinned = pages.find((p) => p.eras.length === 0 && pinnedSlugs.has(p.slug))
    expect(timelessPinned).toBeDefined()
    expect(timelessPinned?.slug).toBe('ninth-vale')
  })

  it('3. the era-linked map is missing at least one era image', () => {
    const eraLinkedMap = world.maps.find((m) => m.eraLinked)
    expect(eraLinkedMap).toBeDefined()
    const missing = world.eraOrder.filter((era) => !(era in (eraLinkedMap?.images ?? {})))
    expect(missing.length).toBeGreaterThanOrEqual(1)
  })

  it('4. the map hierarchy reaches 3 levels (root -> child -> grandchild)', () => {
    const byId = new Map(world.maps.map((m) => [m.id, m]))
    const depthOf = (mapId: string): number => {
      const map = byId.get(mapId)
      if (!map?.parentMap) return 1
      return 1 + depthOf(map.parentMap)
    }
    const maxDepth = Math.max(...world.maps.map((m) => depthOf(m.id)))
    expect(maxDepth).toBeGreaterThanOrEqual(3)
  })

  it('5. a ghost link exists (a wikilink whose target page does not exist)', () => {
    const existingSlugs = new Set(pages.map((p) => p.slug))
    const ghostLinks = pages.flatMap((p) => allWikilinks(p.body).filter((slug) => !existingSlugs.has(slug)))
    expect(ghostLinks.length).toBeGreaterThanOrEqual(1)
    expect(ghostLinks).toContain('the-ninth-map')
  })

  it('6. all 13 v1 blocks appear across bodies', () => {
    const corpus = pages.map((p) => p.body).join('\n\n')
    const blocks: Record<string, RegExp> = {
      Text: /^[A-Za-z].+$/m,
      H1: /^# .+$/m,
      H2: /^## .+$/m,
      H3: /^### .+$/m,
      Bulleted: /^- (?!\[[ xX]\])\S/m,
      Numbered: /^\d+\. .+$/m,
      'To-do': /^- \[[ xX]\] .+$/m,
      Quote: /^> .+$/m,
      Callout: /^:::callout \{type="[a-z]+"\}$/m,
      Toggle: /^:::toggle \{summary="[^"]+"\}$/m,
      Divider: /^---$/m,
      Image: /!\[[^\]]*\]\([^)]+\)/,
      Mention: WIKILINK,
    }
    const missing = Object.entries(blocks)
      .filter(([, re]) => !re.test(corpus))
      .map(([name]) => name)
    expect(missing).toEqual([])
  })

  it('7. all 7 categories have at least 2 pages', () => {
    const counts = new Map<string, number>()
    for (const page of pages) counts.set(page.category, (counts.get(page.category) ?? 0) + 1)
    for (const category of CATEGORIES) {
      expect(counts.get(category) ?? 0, `category "${category}"`).toBeGreaterThanOrEqual(2)
    }
  })

  it('8. at least one page diverges from its category template (extra or removed Property)', () => {
    const charactersTemplate = world.categoryTemplates.find((t) => t.category === 'characters')!
    const templateKeys = new Set(charactersTemplate.properties.map((p) => p.key))
    const sera = pages.find((p) => p.slug === 'sera')!
    const seraKeys = new Set(sera.customProperties.map((p) => p.key))
    expect(seraKeys).not.toEqual(templateKeys)
    expect(seraKeys.has('portrait')).toBe(false) // removed relative to the template
    expect(seraKeys.has('signatureItem')).toBe(true) // added relative to the template
  })

  it('9. filled relations point at real pages, ready to generate frontmatter backlinks', () => {
    const existingSlugs = new Set(pages.map((p) => p.slug))
    const filledRelations = pages.flatMap((p) =>
      p.customProperties
        .filter((prop) => prop.type === 'relation' && Array.isArray(prop.value) && prop.value.length > 0)
        .map((prop) => ({ from: p.slug, prop: prop.key, targets: prop.value as string[] })),
    )
    expect(filledRelations.length).toBeGreaterThan(0)
    for (const relation of filledRelations) {
      for (const target of relation.targets) {
        expect(existingSlugs.has(target), `${relation.from}.${relation.prop} -> ${target}`).toBe(true)
      }
    }
    // Sera's affiliations relation specifically backs a "Mentioned in" backlink on the guild.
    const sera = pages.find((p) => p.slug === 'sera')!
    const affiliations = sera.customProperties.find((p) => p.key === 'affiliations')
    expect(affiliations?.value).toEqual(['cartographers-guild'])
  })
})
