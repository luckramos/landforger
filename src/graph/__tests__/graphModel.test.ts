import { describe, expect, it } from 'vitest'
import type { Page } from '../../domain/types'
import { buildRelationshipGraph } from '../graphModel'

const page = (slug: string, patch: Partial<Page> = {}): Page => ({
  slug,
  title: slug,
  category: 'stories',
  tags: [],
  summary: '',
  eras: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  customProperties: [],
  body: '',
  ...patch,
})

describe('relationship graph model', () => {
  const pages = [
    page('era-one', { category: 'eras' }),
    page('sera', {
      category: 'characters',
      eras: ['era-one'],
      body: 'See [[harbor]] and [[ghost]].',
      customProperties: [{ key: 'ally', label: 'Ally', type: 'relation', value: ['guild', 'harbor'] }],
    }),
    page('harbor', { category: 'locations', body: 'Home of [[sera]].' }),
    page('guild', { category: 'organizations' }),
    page('island', { category: 'locations' }),
  ]

  it('combines live Wikilink, Relation and Era-membership references into unique undirected edges', () => {
    const graph = buildRelationshipGraph(pages, { scope: 'global' })

    expect(graph.nodes.map((node) => node.slug)).toEqual(['era-one', 'sera', 'harbor', 'guild', 'island'])
    expect(graph.edges.map((edge) => [edge.sourceSlug, edge.targetSlug, edge.kinds])).toEqual([
      ['era-one', 'sera', ['era-membership']],
      ['guild', 'sera', ['relation']],
      ['harbor', 'sera', ['body', 'relation']],
    ])
    expect(graph.nodes.find((node) => node.slug === 'sera')?.degree).toBe(3)
  })

  it('limits local scope to the focal Page and direct neighbors while retaining their visible edges', () => {
    const graph = buildRelationshipGraph(pages, { scope: 'local', focalSlug: 'sera' })

    expect(graph.nodes.map((node) => node.slug)).toEqual(['sera', 'era-one', 'guild', 'harbor'])
    expect(graph.edges).toHaveLength(3)
    expect(graph.focalSlug).toBe('sera')
  })

  it('filters categories before calculating visible edges and degrees', () => {
    const graph = buildRelationshipGraph(pages, {
      scope: 'global',
      categories: new Set(['characters', 'locations']),
    })

    expect(graph.nodes.map((node) => node.slug)).toEqual(['sera', 'harbor', 'island'])
    expect(graph.edges.map((edge) => [edge.sourceSlug, edge.targetSlug])).toEqual([['harbor', 'sera']])
    expect(graph.nodes.find((node) => node.slug === 'sera')?.degree).toBe(1)
  })
})
