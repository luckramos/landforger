import type { Page, Pin, WorldMap } from '../domain/types'

/**
 * A Timeless Page is spatially stable. Era-bound Pages require the Active Era
 * to survive all three filters: the World's real Eras, the Page, and the Pin.
 */
export function isPinVisible(pin: Pin, page: Page, activeEra: string, eraOrder: readonly string[]): boolean {
  if (page.eras.length === 0) return true
  if (!eraOrder.includes(activeEra)) return false
  return page.eras.includes(activeEra) && pin.eras.includes(activeEra)
}

/** Resolves the image visible in an Era without borrowing from the future. */
export function resolveMapImage(map: WorldMap, activeEra: string, eraOrder: readonly string[]): string | undefined {
  if (!map.eraLinked) return map.images.all
  const activeIndex = eraOrder.indexOf(activeEra)
  if (activeIndex < 0) return undefined
  for (let index = activeIndex; index >= 0; index -= 1) {
    const image = map.images[eraOrder[index]]
    if (image) return image
  }
  return undefined
}

export function buildMapBreadcrumbs(maps: readonly WorldMap[], mapId: string): WorldMap[] {
  const byId = new Map(maps.map((map) => [map.id, map]))
  const trail: WorldMap[] = []
  const visited = new Set<string>()
  let current = byId.get(mapId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    trail.unshift(current)
    current = current.parentMap ? byId.get(current.parentMap) : undefined
  }
  return trail
}

export function pinsForPage(pins: readonly Pin[], pageSlug: string): Pin[] {
  return pins.filter((pin) => pin.pageSlug === pageSlug)
}

interface Point { x: number; y: number }
interface Size { width: number; height: number }

/** Keeps the 1600×1080 stage covering its viewport; smaller axes stay centred. */
export function clampMapPan(pan: Point, zoom: number, viewport: Size, stage: Size = { width: 1600, height: 1080 }): Point {
  const maxX = Math.max(0, (stage.width * zoom - viewport.width) / 2)
  const maxY = Math.max(0, (stage.height * zoom - viewport.height) / 2)
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  }
}
