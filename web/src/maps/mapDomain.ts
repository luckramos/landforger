import type { MapFolder, Page, Pin, WorldMap } from '../domain/types'

export interface MapCollectionState {
  rootMap?: string
  maps: WorldMap[]
  pins: Pin[]
  /** Library folders; optional so callers that only touch Maps/Pins need not thread it. Persisted from the World's own list when omitted. */
  mapFolders?: MapFolder[]
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

/** The Era whose chart an unset Era actually shows — the nearest earlier Era
    that holds an image (resolveMapImage's carry-forward, surfaced for the UI).
    Undefined when nothing earlier is charted, or the Map isn't era-linked. */
export function inheritedChartEra(map: WorldMap, activeEra: string, eraOrder: readonly string[]): string | undefined {
  if (!map.eraLinked || map.images[activeEra]) return undefined
  const activeIndex = eraOrder.indexOf(activeEra)
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    if (map.images[eraOrder[index]]) return eraOrder[index]
  }
  return undefined
}

/** Renames a Map; an empty title is rejected so a chart never loses its name. */
export function renameMap(state: MapCollectionState, mapId: string, title: string): MapCollectionState {
  const trimmed = title.trim()
  if (!trimmed) return state
  return { ...state, maps: state.maps.map((map) => map.id === mapId ? { ...map, title: trimmed } : map) }
}

/** Assigns — or clears, when `image` is empty — the chart drawn for one key: an
    Era Slug on an era-linked Map, or `all` on a Map with a single fixed chart. */
export function setMapChart(state: MapCollectionState, mapId: string, key: string, image?: string): MapCollectionState {
  return {
    ...state,
    maps: state.maps.map((map) => {
      if (map.id !== mapId) return map
      const images = { ...map.images }
      if (image && image.trim()) images[key] = image
      else delete images[key]
      return { ...map, images }
    }),
  }
}

/**
 * Switches a Map between one fixed chart and a chart redrawn per Era, carrying
 * the chart visible right now across the boundary so the Map never blanks.
 * Pins are untouched — they belong to the place, not to any single chart.
 */
export function setMapEraLinked(
  state: MapCollectionState,
  mapId: string,
  eraLinked: boolean,
  activeEra: string,
  eraOrder: readonly string[],
): MapCollectionState {
  return {
    ...state,
    maps: state.maps.map((map) => {
      if (map.id !== mapId || map.eraLinked === eraLinked) return map
      const current = resolveMapImage(map, activeEra, eraOrder)
      if (eraLinked) {
        // Fixed → per-era: seed the earliest Era so the whole timeline keeps
        // showing today's chart until the author diverges a later Era.
        const seedEra = eraOrder[0]
        return { ...map, eraLinked: true, images: seedEra && current ? { [seedEra]: current } : {} }
      }
      // Per-era → fixed: collapse to whatever chart is on screen right now.
      return { ...map, eraLinked: false, images: current ? { all: current } : {} }
    }),
  }
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

function toSlug(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/**
 * Charts a World's first top-level Map from a title (and optional image) and
 * promotes it to Root Map — the seam behind the "no Map yet" empty state.
 */
export function createRootMap(state: MapCollectionState, title: string, image?: string): MapCollectionState {
  const id = uniqueId(toSlug(title) || 'map', new Set(state.maps.map((map) => map.id)))
  return {
    ...state,
    rootMap: id,
    maps: [...state.maps, { id, title, eraLinked: false, images: image ? { all: image } : {} }],
  }
}

/**
 * Adds a Map to the Library inside `folder` (root when omitted). The first Map
 * a World ever gains also becomes its Root Map, so opening the World Map never
 * dead-ends on a freshly-stocked Library.
 */
export function createMapInFolder(state: MapCollectionState, title: string, folder?: string, image?: string): MapCollectionState {
  const id = uniqueId(toSlug(title) || 'map', new Set(state.maps.map((map) => map.id)))
  const map: WorldMap = { id, title, eraLinked: false, images: image ? { all: image } : {}, ...(folder ? { folder } : {}) }
  return {
    ...state,
    rootMap: state.rootMap ?? id,
    maps: [...state.maps, map],
  }
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

// --- Library folders ---
// An organizational tree laid over the Maps, independent of the parentMap/
// parentPin drill-down hierarchy. A Map's `folder` (and a folder's
// `parentFolder`) is absent when it sits at the Library root.

function dropFolder<T extends { folder?: string }>(entity: T): T {
  const { folder: _folder, ...rest } = entity
  return rest as T
}

function dropParentFolder(folder: MapFolder): MapFolder {
  const { parentFolder: _parentFolder, ...rest } = folder
  return rest
}

/** True when `folderId` sits anywhere below `possibleAncestor` in the folder tree. */
export function folderHasAncestor(folders: readonly MapFolder[], folderId: string, possibleAncestor: string): boolean {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const visited = new Set<string>()
  let current = byId.get(folderId)
  while (current?.parentFolder && !visited.has(current.id)) {
    if (current.parentFolder === possibleAncestor) return true
    visited.add(current.id)
    current = byId.get(current.parentFolder)
  }
  return false
}

/** Root-to-folder trail for the breadcrumb; empty at the Library root. */
export function folderPath(folders: readonly MapFolder[], folderId?: string): MapFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const trail: MapFolder[] = []
  const visited = new Set<string>()
  let current = folderId ? byId.get(folderId) : undefined
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    trail.unshift(current)
    current = current.parentFolder ? byId.get(current.parentFolder) : undefined
  }
  return trail
}

/** The folders filed directly inside `parentFolder` (the root when omitted), title-sorted. */
export function childFolders(folders: readonly MapFolder[], parentFolder?: string): MapFolder[] {
  return folders
    .filter((folder) => (folder.parentFolder ?? undefined) === (parentFolder ?? undefined))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The Maps filed directly inside `folder` (the root when omitted), preserving Library order. */
export function mapsInFolder(maps: readonly WorldMap[], folder?: string): WorldMap[] {
  return maps.filter((map) => (map.folder ?? undefined) === (folder ?? undefined))
}

/** Creates a folder inside `parentFolder` (root when omitted). */
export function createFolder(state: MapCollectionState, name: string, parentFolder?: string): MapCollectionState {
  const folders = state.mapFolders ?? []
  const id = uniqueId(toSlug(name) || 'folder', new Set(folders.map((folder) => folder.id)))
  const folder: MapFolder = { id, name: name.trim() || 'New folder', ...(parentFolder ? { parentFolder } : {}) }
  return { ...state, mapFolders: [...folders, folder] }
}

export function renameFolder(state: MapCollectionState, folderId: string, name: string): MapCollectionState {
  const trimmed = name.trim()
  if (!trimmed) return state
  return { ...state, mapFolders: (state.mapFolders ?? []).map((folder) => folder.id === folderId ? { ...folder, name: trimmed } : folder) }
}

/** Removes a folder without losing anything: its subfolders and Maps rise to its own parent. */
export function deleteFolder(state: MapCollectionState, folderId: string): MapCollectionState {
  const folders = state.mapFolders ?? []
  const target = folders.find((folder) => folder.id === folderId)
  if (!target) return state
  const parent = target.parentFolder
  return {
    ...state,
    mapFolders: folders
      .filter((folder) => folder.id !== folderId)
      .map((folder) => folder.parentFolder === folderId
        ? (parent ? { ...folder, parentFolder: parent } : dropParentFolder(folder))
        : folder),
    maps: state.maps.map((map) => map.folder === folderId ? (parent ? { ...map, folder: parent } : dropFolder(map)) : map),
  }
}

/** Files a Map under `folder` (root when omitted). */
export function moveMapToFolder(state: MapCollectionState, mapId: string, folder?: string): MapCollectionState {
  return { ...state, maps: state.maps.map((map) => map.id === mapId ? (folder ? { ...map, folder } : dropFolder(map)) : map) }
}

/** Re-nests a folder under `parentFolder` (root when omitted); a no-op if it would create a cycle. */
export function moveFolder(state: MapCollectionState, folderId: string, parentFolder?: string): MapCollectionState {
  const folders = state.mapFolders ?? []
  if (!folders.some((folder) => folder.id === folderId)) return state
  if (parentFolder === folderId) return state
  if (parentFolder && folderHasAncestor(folders, parentFolder, folderId)) return state
  return {
    ...state,
    mapFolders: folders.map((folder) => folder.id === folderId
      ? (parentFolder ? { ...folder, parentFolder } : dropParentFolder(folder))
      : folder),
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
