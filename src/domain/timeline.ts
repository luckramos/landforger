import { CATEGORIES, type Category, type Page, type World } from './types'

export interface TimelineEra {
  page: Page
  dateLabel: string
  members: Map<Category, Page[]>
  memberCount: number
}

/** Keeps the Active Era inside the ordered timeline; an empty timeline has no Active Era. */
export function normalizeActiveEra(eraOrder: string[], activeEra: string): string {
  if (eraOrder.includes(activeEra)) return activeEra
  return eraOrder.at(-1) ?? ''
}

export function normalizeWorldTimeline(world: World): World {
  const eraOrder = [...new Set(world.eraOrder)]
  const activeEra = normalizeActiveEra(eraOrder, world.activeEra)
  return eraOrder.length === world.eraOrder.length && activeEra === world.activeEra
    ? world
    : { ...world, eraOrder, activeEra }
}

export function reorderEras(eraOrder: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= eraOrder.length || to >= eraOrder.length) return eraOrder
  const next = [...eraOrder]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function eraDateLabel(page: Page): string {
  const property = page.customProperties.find((candidate) => candidate.key === 'datelabel')
  return typeof property?.value === 'string' ? property.value : ''
}

/** Repository-derived timeline: Timeless Pages never become members. */
export function buildTimeline(world: World, pages: Page[]): TimelineEra[] {
  const bySlug = new Map(pages.map((page) => [page.slug, page]))
  return world.eraOrder.flatMap((eraSlug) => {
    const era = bySlug.get(eraSlug)
    if (!era || era.category !== 'eras') return []
    const members = new Map<Category, Page[]>()
    for (const category of CATEGORIES) {
      if (category === 'eras') continue
      const entries = pages.filter((page) => page.category === category && page.eras.includes(eraSlug))
      if (entries.length > 0) members.set(category, entries.sort((a, b) => a.title.localeCompare(b.title)))
    }
    return [{ page: era, dateLabel: eraDateLabel(era), members, memberCount: [...members.values()].flat().length }]
  })
}
