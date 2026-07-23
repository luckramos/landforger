import { describe, expect, it } from 'vitest'
import type { Page, Pin, WorldMap } from '../../domain/types'
import {
  buildMapBreadcrumbs,
  childFolders,
  clampMapPan,
  clampPinPosition,
  createChildMap,
  createFolder,
  createMapInFolder,
  createPin,
  createRootMap,
  deleteFolder,
  deleteMap,
  folderHasAncestor,
  folderPath,
  isPinVisible,
  mapsInFolder,
  moveFolder,
  moveMapToFolder,
  inheritedChartEra,
  narrowPinEras,
  renameFolder,
  renameMap,
  reparentMap,
  resolveMapImage,
  setMapChart,
  setMapEraLinked,
  setRootMap,
} from '../mapDomain'

const page = (eras: string[]): Page => ({
  slug: 'sera',
  title: 'Sera',
  category: 'characters',
  tags: [],
  summary: '',
  eras,
  created: '',
  updated: '',
  customProperties: [],
  body: '',
})

const pin = (eras: string[]): Pin => ({
  id: 'pin-sera',
  mapId: 'coast',
  pageSlug: 'sera',
  x: 40,
  y: 60,
  eras,
})

describe('Map domain rules', () => {
  it('keeps Timeless Pages visible in every Active Era', () => {
    expect(isPinVisible(pin([]), page([]), 'era-now', ['era-before', 'era-now'])).toBe(true)
  })

  it('shows an era-bound Pin only when the Active Era belongs to both Pin and Page', () => {
    const eras = ['era-before', 'era-now']
    expect(isPinVisible(pin(['era-now']), page(eras), 'era-now', eras)).toBe(true)
    expect(isPinVisible(pin(['era-now']), page(eras), 'era-before', eras)).toBe(false)
    expect(isPinVisible(pin(['era-before', 'era-now']), page(['era-before']), 'era-now', eras)).toBe(false)
  })

  it('ignores ghost Eras even when the Page and Pin still reference them', () => {
    expect(isPinVisible(pin(['era-ghost']), page(['era-ghost']), 'era-ghost', ['era-now'])).toBe(false)
  })

  it('uses the nearest earlier image for an era-linked Map and never looks forward', () => {
    const map: WorldMap = {
      id: 'coast',
      title: 'Coast',
      eraLinked: true,
      images: { 'era-first': '/first.svg', 'era-third': '/third.svg' },
    }
    const order = ['era-first', 'era-second', 'era-third']
    expect(resolveMapImage(map, 'era-second', order)).toBe('/first.svg')
    expect(resolveMapImage(map, 'era-first', order)).toBe('/first.svg')
    expect(resolveMapImage(map, 'era-unknown', order)).toBeUndefined()
  })

  it('names the Era an unset Era inherits its chart from, and nothing when charted or fixed', () => {
    const order = ['era-first', 'era-second', 'era-third']
    const linked: WorldMap = { id: 'coast', title: 'Coast', eraLinked: true, images: { 'era-first': '/first.svg' } }
    expect(inheritedChartEra(linked, 'era-third', order)).toBe('era-first')
    expect(inheritedChartEra(linked, 'era-first', order)).toBeUndefined() // charted itself
    expect(inheritedChartEra({ ...linked, images: {} }, 'era-second', order)).toBeUndefined() // nothing earlier
    const fixed: WorldMap = { id: 'coast', title: 'Coast', eraLinked: false, images: { all: '/x.svg' } }
    expect(inheritedChartEra(fixed, 'era-second', order)).toBeUndefined()
  })

  it('renames a Map but refuses to blank its title', () => {
    const state = { maps: [{ id: 'coast', title: 'Coast', eraLinked: false, images: {} }] as WorldMap[], pins: [] }
    expect(renameMap(state, 'coast', '  Sunken Reach ').maps[0].title).toBe('Sunken Reach')
    expect(renameMap(state, 'coast', '   ')).toBe(state)
  })

  it('assigns and clears a single chart key without disturbing the others', () => {
    const state = { maps: [{ id: 'coast', title: 'Coast', eraLinked: true, images: { 'era-first': '/a.svg' } }] as WorldMap[], pins: [] }
    expect(setMapChart(state, 'coast', 'era-third', '/c.svg').maps[0].images).toEqual({ 'era-first': '/a.svg', 'era-third': '/c.svg' })
    expect(setMapChart(state, 'coast', 'era-first', undefined).maps[0].images).toEqual({})
  })

  it('carries the visible chart across the fixed⇄per-era switch and leaves Pins alone', () => {
    const order = ['era-first', 'era-second', 'era-third']
    const pins = [{ id: 'pin-a', mapId: 'coast', pageSlug: 'a', x: 5, y: 5, eras: [] }]
    const fixed = { maps: [{ id: 'coast', title: 'Coast', eraLinked: false, images: { all: '/all.svg' } }] as WorldMap[], pins }

    // Fixed → per-era seeds the earliest Era so the timeline keeps today's chart.
    const linked = setMapEraLinked(fixed, 'coast', true, 'era-third', order)
    expect(linked.maps[0]).toMatchObject({ eraLinked: true, images: { 'era-first': '/all.svg' } })
    expect(linked.pins).toBe(pins)

    // Per-era → fixed collapses to the chart visible in the Active Era.
    const perEra = { maps: [{ id: 'coast', title: 'Coast', eraLinked: true, images: { 'era-first': '/f.svg', 'era-third': '/t.svg' } }] as WorldMap[], pins }
    expect(setMapEraLinked(perEra, 'coast', false, 'era-second', order).maps[0]).toMatchObject({ eraLinked: false, images: { all: '/f.svg' } })
  })

  it('builds Root-to-current breadcrumbs from the Map hierarchy', () => {
    const maps: WorldMap[] = [
      { id: 'coast', title: 'Coast', eraLinked: false, images: { all: '/coast.svg' } },
      { id: 'city', title: 'City', eraLinked: false, images: { all: '/city.svg' }, parentMap: 'coast' },
      { id: 'keep', title: 'Keep', eraLinked: false, images: { all: '/keep.svg' }, parentMap: 'city' },
    ]
    expect(buildMapBreadcrumbs(maps, 'keep').map((map) => map.id)).toEqual(['coast', 'city', 'keep'])
  })

  it('clamps pan so a zoomed chart cannot expose empty space', () => {
    expect(clampMapPan({ x: 9999, y: -9999 }, 1, { width: 1000, height: 600 })).toEqual({ x: 300, y: -240 })
    expect(clampMapPan({ x: 200, y: 200 }, 0.6, { width: 1000, height: 700 })).toEqual({ x: 0, y: 0 })
  })

  it('clamps edited Pin positions inside the chart safe area', () => {
    expect(clampPinPosition({ x: -30, y: 140 })).toEqual({ x: 2, y: 98 })
    expect(clampPinPosition({ x: 42.25, y: 61.5 })).toEqual({ x: 42.25, y: 61.5 })
  })

  it('creates multiple Pins for one Page with unique ids and inherited Page Eras', () => {
    const existing = [pin(['era-before'])]
    const first = createPin(existing, 'coast', page(['era-before', 'era-now']), { x: 10, y: 20 })
    const second = createPin([...existing, first], 'coast', page(['era-before', 'era-now']), { x: 30, y: 40 })
    expect(first).toMatchObject({ id: 'pin-sera-2', pageSlug: 'sera', eras: ['era-before', 'era-now'], x: 10, y: 20 })
    expect(second.id).toBe('pin-sera-3')
  })

  it('narrows Pin Eras to real Page Eras but leaves Timeless Pins immutable', () => {
    const existing = pin(['era-before', 'era-now'])
    expect(narrowPinEras(existing, page(['era-before', 'era-now']), ['era-now', 'era-ghost'], ['era-before', 'era-now']))
      .toEqual({ ...existing, eras: ['era-now'] })
    expect(narrowPinEras(existing, page(['era-before', 'era-now']), [], ['era-before', 'era-now']))
      .toEqual(existing)
    expect(narrowPinEras(pin([]), page([]), ['era-now'], ['era-now'])).toEqual(pin([]))
  })

  it('charts a first Map from a title + image and promotes it to Root Map', () => {
    const state = createRootMap({ maps: [], pins: [] }, 'The Drowned Coast', '/coast.png')
    expect(state.rootMap).toBe('the-drowned-coast')
    expect(state.maps).toEqual([{ id: 'the-drowned-coast', title: 'The Drowned Coast', eraLinked: false, images: { all: '/coast.png' } }])
  })

  it('gives an untitled or colliding Root Map a safe unique id and no image', () => {
    const state = createRootMap({ rootMap: 'map', maps: [{ id: 'map', title: '', eraLinked: false, images: {} }], pins: [] }, '  ')
    expect(state.maps[1]).toEqual({ id: 'map-2', title: '  ', eraLinked: false, images: {} })
    expect(state.rootMap).toBe('map-2')
  })

  it('creates a child Map from a Pin and links both sides of the hierarchy', () => {
    const state = createChildMap({ maps: [], pins: [pin([])] }, pin([]).id, 'Sera')
    expect(state.maps).toEqual([{ id: 'sera', title: 'Sera', eraLinked: false, images: {}, parentMap: 'coast', parentPin: 'pin-sera' }])
    expect(state.pins[0].childMap).toBe('sera')
  })

  it('deletes a Map with its Pins and returns direct children to the Library', () => {
    const state = deleteMap({
      rootMap: 'coast',
      maps: [
        { id: 'coast', title: 'Coast', eraLinked: false, images: {} },
        { id: 'city', title: 'City', eraLinked: false, images: {}, parentMap: 'coast', parentPin: 'pin-sera' },
      ],
      pins: [{ ...pin([]), childMap: 'city' }],
    }, 'coast')
    expect(state.maps).toEqual([{ id: 'city', title: 'City', eraLinked: false, images: {} }])
    expect(state.pins).toEqual([])
    expect(state.rootMap).toBe('city')
  })

  it('adds a Library Map into a folder and roots only the very first Map', () => {
    const first = createMapInFolder({ maps: [], pins: [] }, 'Coast', 'coastal')
    expect(first.maps).toEqual([{ id: 'coast', title: 'Coast', eraLinked: false, images: {}, folder: 'coastal' }])
    expect(first.rootMap).toBe('coast')
    const second = createMapInFolder(first, 'City', 'coastal', '/city.png')
    expect(second.rootMap).toBe('coast')
    expect(second.maps[1]).toEqual({ id: 'city', title: 'City', eraLinked: false, images: { all: '/city.png' }, folder: 'coastal' })
  })

  it('nests folders and reads the root-to-folder breadcrumb path', () => {
    let state = createFolder({ maps: [], pins: [] }, 'Coastal charts')
    state = createFolder(state, 'The deep', 'coastal-charts')
    expect(state.mapFolders).toEqual([
      { id: 'coastal-charts', name: 'Coastal charts' },
      { id: 'the-deep', name: 'The deep', parentFolder: 'coastal-charts' },
    ])
    expect(folderPath(state.mapFolders!, 'the-deep').map((folder) => folder.id)).toEqual(['coastal-charts', 'the-deep'])
    expect(folderPath(state.mapFolders!, undefined)).toEqual([])
    expect(childFolders(state.mapFolders!).map((folder) => folder.id)).toEqual(['coastal-charts'])
    expect(childFolders(state.mapFolders!, 'coastal-charts').map((folder) => folder.id)).toEqual(['the-deep'])
  })

  it('lists the Maps filed directly in a folder or at the Library root', () => {
    const maps: WorldMap[] = [
      { id: 'coast', title: 'Coast', eraLinked: false, images: {}, folder: 'coastal' },
      { id: 'atlas', title: 'Atlas', eraLinked: false, images: {} },
    ]
    expect(mapsInFolder(maps, 'coastal').map((map) => map.id)).toEqual(['coast'])
    expect(mapsInFolder(maps).map((map) => map.id)).toEqual(['atlas'])
  })

  it('renames a folder and ignores an all-whitespace name', () => {
    const state = { maps: [], pins: [], mapFolders: [{ id: 'coastal', name: 'Coastal' }] }
    expect(renameFolder(state, 'coastal', 'Tidelands').mapFolders).toEqual([{ id: 'coastal', name: 'Tidelands' }])
    expect(renameFolder(state, 'coastal', '   ')).toBe(state)
  })

  it('moves a Map between a folder and the Library root', () => {
    const maps: WorldMap[] = [{ id: 'coast', title: 'Coast', eraLinked: false, images: {} }]
    const filed = moveMapToFolder({ maps, pins: [] }, 'coast', 'coastal')
    expect(filed.maps[0].folder).toBe('coastal')
    expect(moveMapToFolder(filed, 'coast').maps[0]).not.toHaveProperty('folder')
  })

  it('deleting a folder re-homes its subfolders and Maps to its own parent', () => {
    const state = {
      maps: [
        { id: 'coast', title: 'Coast', eraLinked: false, images: {}, folder: 'deep' },
        { id: 'atlas', title: 'Atlas', eraLinked: false, images: {}, folder: 'coastal' },
      ] as WorldMap[],
      pins: [],
      mapFolders: [
        { id: 'coastal', name: 'Coastal' },
        { id: 'deep', name: 'Deep', parentFolder: 'coastal' },
        { id: 'trench', name: 'Trench', parentFolder: 'deep' },
      ],
    }
    const next = deleteFolder(state, 'deep')
    expect(next.mapFolders).toEqual([
      { id: 'coastal', name: 'Coastal' },
      { id: 'trench', name: 'Trench', parentFolder: 'coastal' },
    ])
    // The Map filed in the removed folder rises to the parent; siblings untouched.
    expect(next.maps.find((map) => map.id === 'coast')?.folder).toBe('coastal')
    expect(next.maps.find((map) => map.id === 'atlas')?.folder).toBe('coastal')
  })

  it('deleting a top-level folder returns its contents to the Library root', () => {
    const state = {
      maps: [{ id: 'coast', title: 'Coast', eraLinked: false, images: {}, folder: 'coastal' }] as WorldMap[],
      pins: [],
      mapFolders: [
        { id: 'coastal', name: 'Coastal' },
        { id: 'deep', name: 'Deep', parentFolder: 'coastal' },
      ],
    }
    const next = deleteFolder(state, 'coastal')
    expect(next.mapFolders).toEqual([{ id: 'deep', name: 'Deep' }])
    expect(next.maps[0]).not.toHaveProperty('folder')
  })

  it('refuses to move a folder inside its own descendant (no cycles)', () => {
    const state = {
      maps: [],
      pins: [],
      mapFolders: [
        { id: 'coastal', name: 'Coastal' },
        { id: 'deep', name: 'Deep', parentFolder: 'coastal' },
      ],
    }
    expect(folderHasAncestor(state.mapFolders, 'deep', 'coastal')).toBe(true)
    expect(moveFolder(state, 'coastal', 'deep')).toBe(state)
    expect(moveFolder(state, 'coastal', 'coastal')).toBe(state)
    const moved = moveFolder(state, 'deep', undefined)
    expect(moved.mapFolders!.find((folder) => folder.id === 'deep')).not.toHaveProperty('parentFolder')
  })

  it('re-parents a Map through a Pin and can detach it as the Root Map', () => {
    const maps: WorldMap[] = [
      { id: 'coast', title: 'Coast', eraLinked: false, images: {} },
      { id: 'city', title: 'City', eraLinked: false, images: {} },
    ]
    const attached = reparentMap({ maps, pins: [pin([])], rootMap: 'coast' }, 'city', 'pin-sera')
    expect(attached.maps[1]).toMatchObject({ parentMap: 'coast', parentPin: 'pin-sera' })
    expect(attached.pins[0].childMap).toBe('city')

    const rooted = setRootMap(attached, 'city')
    expect(rooted.rootMap).toBe('city')
    expect(rooted.maps[1]).not.toHaveProperty('parentMap')
    expect(rooted.pins[0]).not.toHaveProperty('childMap')
  })
})
