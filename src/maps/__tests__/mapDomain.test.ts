import { describe, expect, it } from 'vitest'
import type { Page, Pin, WorldMap } from '../../domain/types'
import {
  buildMapBreadcrumbs,
  clampMapPan,
  clampPinPosition,
  createChildMap,
  createPin,
  deleteMap,
  isPinVisible,
  narrowPinEras,
  reparentMap,
  resolveMapImage,
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
