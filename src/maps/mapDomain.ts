import type { Page, Pin, WorldMap } from '../domain/types'

export interface MapCollectionState {
  rootMap?: string
  maps: WorldMap[]
  pins: Pin[]
}

interface MapPoint { x: number; y: number }

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

/** The design reserves a narrow safe area so a Pin and its label never fall off-chart. */
export function clampPinPosition(position: MapPoint): MapPoint {
  return {
    x: Math.min(98, Math.max(2, position.x)),
    y: Math.min(98, Math.max(2, position.y)),
  }
}

function uniqueId(base: string, usedIds: ReadonlySet<string>): string {
  if (!usedIds.has(base)) return base
  let suffix = 2
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/** Creates one placement; duplicate Page/Map placements are intentionally valid. */
export function createPin(
  pins: readonly Pin[],
  mapId: string,
  page: Page,
  position: MapPoint,
): Pin {
  return {
    id: uniqueId(`pin-${page.slug}`, new Set(pins.map((candidate) => candidate.id))),
    mapId,
    pageSlug: page.slug,
    ...clampPinPosition(position),
    eras: [...page.eras],
  }
}

/**
 * A non-Timeless Pin must retain at least one real Era. Timeless Pins have no
 * checklist state at all, and are therefore deliberately immutable here.
 */
export function narrowPinEras(
  pin: Pin,
  page: Page,
  requestedEras: readonly string[],
  eraOrder: readonly string[],
): Pin {
  if (page.eras.length === 0) return pin
  const allowed = new Set(page.eras.filter((era) => eraOrder.includes(era)))
  const eras = eraOrder.filter((era) => allowed.has(era) && requestedEras.includes(era))
  return eras.length > 0 ? { ...pin, eras } : pin
}

function withoutParent(map: WorldMap): WorldMap {
  const { parentMap: _parentMap, parentPin: _parentPin, ...detached } = map
  return detached
}

function withoutChild(pin: Pin): Pin {
  const { childMap: _childMap, ...detached } = pin
  return detached
}

/** Creates an empty child Map and links it to the source Pin in one atomic state change. */
export function createChildMap(state: MapCollectionState, pinId: string, title: string): MapCollectionState {
  const sourcePin = state.pins.find((pin) => pin.id === pinId)
  if (!sourcePin || sourcePin.childMap) return state
  const id = uniqueId(sourcePin.pageSlug, new Set(state.maps.map((map) => map.id)))
  return {
    ...state,
    maps: [...state.maps, {
      id,
      title,
      eraLinked: false,
      images: {},
      parentMap: sourcePin.mapId,
      parentPin: sourcePin.id,
    }],
    pins: state.pins.map((pin) => pin.id === sourcePin.id ? { ...pin, childMap: id } : pin),
  }
}

/** Removes the Map's placements; its direct children become unparented Library entries. */
export function deleteMap(state: MapCollectionState, mapId: string): MapCollectionState {
  if (!state.maps.some((map) => map.id === mapId)) return state
  const maps = state.maps
    .filter((map) => map.id !== mapId)
    .map((map) => map.parentMap === mapId ? withoutParent(map) : map)
  const pins = state.pins
    .filter((pin) => pin.mapId !== mapId)
    .map((pin) => pin.childMap === mapId ? withoutChild(pin) : pin)
  const rootMap = state.rootMap === mapId
    ? maps.find((map) => !map.parentMap)?.id ?? maps[0]?.id
    : state.rootMap
  return { ...state, ...(rootMap ? { rootMap } : { rootMap: undefined }), maps, pins }
}

function mapHasAncestor(maps: readonly WorldMap[], mapId: string, possibleAncestor: string): boolean {
  const byId = new Map(maps.map((map) => [map.id, map]))
  const visited = new Set<string>()
  let current = byId.get(mapId)
  while (current?.parentMap && !visited.has(current.id)) {
    if (current.parentMap === possibleAncestor) return true
    visited.add(current.id)
    current = byId.get(current.parentMap)
  }
  return false
}

/** Attaches a Map through a free Pin, or detaches it when no Pin is supplied. */
export function reparentMap(state: MapCollectionState, mapId: string, parentPinId?: string): MapCollectionState {
  const subject = state.maps.find((map) => map.id === mapId)
  if (!subject) return state
  const parentPin = parentPinId ? state.pins.find((pin) => pin.id === parentPinId) : undefined
  if (parentPinId && !parentPin) return state
  if (parentPin && (parentPin.childMap && parentPin.childMap !== mapId)) return state
  if (parentPin && (parentPin.mapId === mapId || mapHasAncestor(state.maps, parentPin.mapId, mapId))) return state

  const oldParentPin = subject.parentPin
  const maps = state.maps.map((map) => map.id === mapId
    ? parentPin
      ? { ...withoutParent(map), parentMap: parentPin.mapId, parentPin: parentPin.id }
      : withoutParent(map)
    : map)
  const pins = state.pins.map((pin) => {
    if (pin.id === parentPin?.id) return { ...pin, childMap: mapId }
    if (pin.id === oldParentPin && pin.childMap === mapId) return withoutChild(pin)
    return pin
  })
  const nextRoot = state.rootMap === mapId && parentPin
    ? maps.find((map) => map.id !== mapId && !map.parentMap)?.id
    : state.rootMap
  return { ...state, rootMap: nextRoot, maps, pins }
}

/** A Root Map cannot remain somebody's child, so both hierarchy links are detached. */
export function setRootMap(state: MapCollectionState, mapId: string): MapCollectionState {
  const subject = state.maps.find((map) => map.id === mapId)
  if (!subject) return state
  return {
    ...state,
    rootMap: mapId,
    maps: state.maps.map((map) => map.id === mapId ? withoutParent(map) : map),
    pins: state.pins.map((pin) => pin.childMap === mapId ? withoutChild(pin) : pin),
  }
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
