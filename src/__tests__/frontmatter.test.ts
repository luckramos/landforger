import { describe, expect, it } from 'vitest'
import { pageFromMarkdown, pageToMarkdown } from '../domain/page'
import type { Page, World } from '../domain/types'
import { worldFromMarkdown, worldToMarkdown } from '../domain/world'

const fullPage: Page = {
  slug: 'sera',
  category: 'characters',
  title: 'Sera Valen',
  tags: ['protagonist', 'cartographer', 'coastal'],
  summary: 'A guild cartographer chasing the ninth map before the tide swallows the coast.',
  cover: '/maps/ninth-vale.svg',
  eras: ['era-charts', 'era-saltcinder'],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-02-14T09:30:00.000Z',
  customProperties: [
    { key: 'aliases', label: 'Aliases', type: 'text', value: 'The Wayfarer of the Ninth Vale' },
    { key: 'history', label: 'History', type: 'textarea', value: 'Born beyond the tide.' },
    { key: 'status', label: 'Status', type: 'select', options: ['Missing', 'Found'], value: 'Found' },
    { key: 'portrait', label: 'Portrait', type: 'image', value: '/portraits/sera.webp' },
    { key: 'age', label: 'Age', type: 'number', value: 29 },
    { key: 'birthday', label: 'Birthday', type: 'date', value: '2026-04-12' },
    { key: 'role', label: 'Role', type: 'text', value: 'Guild Cartographer' },
    {
      key: 'affiliations',
      label: 'Affiliations',
      type: 'relation',
      targetCategories: ['organizations'],
      value: ['cartographers-guild'],
    },
    { key: 'origin', label: 'Origin', type: 'relation', targetCategories: ['locations'], value: ['duskwater'] },
  ],
  body: '# Sera Valen\n\nA cartographer of the guild, chasing [[the-ninth-map]].\n',
}

describe('Page <-> Markdown round-trip', () => {
  it('parses back an identical Page after serializing', () => {
    const md = pageToMarkdown(fullPage)
    expect(pageFromMarkdown(md)).toEqual(fullPage)
  })

  it('never leaks raw frontmatter text into the parsed Page body', () => {
    const md = pageToMarkdown(fullPage)
    const parsed = pageFromMarkdown(md)
    expect(parsed.body).not.toContain('---')
    expect(parsed.body).not.toContain('slug: sera')
  })

  it('is idempotent: serializing twice yields byte-identical Markdown', () => {
    const once = pageToMarkdown(fullPage)
    const twice = pageToMarkdown(pageFromMarkdown(once))
    expect(twice).toBe(once)
  })

  it('round-trips a Page with no cover and no custom properties', () => {
    const minimal: Page = {
      slug: 'era-founding',
      category: 'eras',
      title: 'The Founding Tides',
      tags: ['dawn'],
      summary: 'Before the First Sounding.',
      eras: [],
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      customProperties: [],
      body: 'Before the world had a name.\n',
    }
    expect(pageFromMarkdown(pageToMarkdown(minimal))).toEqual(minimal)
    expect(pageToMarkdown(minimal)).not.toContain('cover:')
  })
})

const fullWorld: World = {
  slug: 'ninth-vale',
  name: 'The Ninth Vale',
  genre: 'Fantasy',
  color: 'oklch(0.68 0.1 38)',
  logline: 'A guild cartographer races the rising tide to recover the ninth map.',
  eraOrder: ['era-founding', 'era-charts', 'era-drowning', 'era-saltcinder'],
  activeEra: 'era-saltcinder',
  rootMap: 'drowned-coast',
  categoryTemplates: [
    {
      category: 'characters',
      properties: [
        { key: 'aliases', label: 'Aliases', type: 'text' },
        { key: 'affiliations', label: 'Affiliations', type: 'relation', targetCategories: ['organizations'] },
      ],
    },
    {
      category: 'locations',
      properties: [{ key: 'type', label: 'Type', type: 'select', options: ['City', 'Region', 'Building'] }],
    },
  ],
  maps: [
    {
      id: 'drowned-coast',
      title: 'The Drowned Coast',
      eraLinked: true,
      images: { 'era-founding': '/maps/drowned-coast-founding.svg', 'era-saltcinder': '/maps/drowned-coast-saltcinder.svg' },
    },
    {
      id: 'ninth-vale',
      title: 'The Ninth Vale',
      eraLinked: false,
      images: { all: '/maps/ninth-vale.svg' },
      parentMap: 'drowned-coast',
      parentPin: 'pin-ninth-vale',
    },
  ],
  pins: [
    { id: 'pin-ninth-vale', mapId: 'drowned-coast', pageSlug: 'ninth-vale', x: 62.5, y: 35, eras: [], childMap: 'ninth-vale' },
    { id: 'pin-sera-charts', mapId: 'duskwater', pageSlug: 'sera', x: 40, y: 58, eras: ['era-charts'] },
  ],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-07-01T00:00:00.000Z',
  body: 'World notes: the coast is rising.\n',
}

describe('World <-> Markdown round-trip (_world.md)', () => {
  it('parses back an identical World after serializing', () => {
    const md = worldToMarkdown(fullWorld)
    expect(worldFromMarkdown(md)).toEqual(fullWorld)
  })

  it('is idempotent: serializing twice yields byte-identical Markdown', () => {
    const once = worldToMarkdown(fullWorld)
    const twice = worldToMarkdown(worldFromMarkdown(once))
    expect(twice).toBe(once)
  })

  it('round-trips a skeleton World with no maps, pins, or root map', () => {
    const skeleton: World = {
      slug: 'marrowmoor',
      name: 'Marrowmoor',
      genre: 'Horror',
      color: 'oklch(0.68 0.1 350)',
      logline: 'A fog-drowned heath keeps a reliquary keeper who has outlived every pilgrim sent to relieve her.',
      eraOrder: [],
      activeEra: '',
      categoryTemplates: [],
      maps: [],
      pins: [],
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      body: '',
    }
    expect(worldFromMarkdown(worldToMarkdown(skeleton))).toEqual(skeleton)
    expect(worldToMarkdown(skeleton)).not.toContain('rootMap:')
  })
})
