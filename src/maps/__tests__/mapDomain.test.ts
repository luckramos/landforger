import { describe, expect, it } from 'vitest'
import type { Page, Pin, WorldMap } from '../../domain/types'
import { buildMapBreadcrumbs, clampMapPan, isPinVisible, resolveMapImage } from '../mapDomain'

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
})
