import type { Page } from '../domain/types'
import { deriveBacklinks, extractWikilinkSlugs } from '../domain/backlinks'
import { pageBodyCodec } from '../editor/codec/TiptapMarkdownCodec'
import { describe, expect, it } from 'vitest'

const page = (patch: Partial<Page> & Pick<Page, 'slug' | 'title' | 'category'>): Page => ({
  tags: [],
  summary: '',
  eras: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  customProperties: [],
  body: '',
  ...patch,
})

function parsedSlugs(body: string): string[] {
  const slugs: string[] = []
  const visit = (node: ReturnType<typeof pageBodyCodec.parse>) => {
    if (node.type === 'wikilink' && typeof node.attrs?.id === 'string') slugs.push(node.attrs.id)
    node.content?.forEach(visit)
  }
  visit(pageBodyCodec.parse(body))
  return slugs
}

describe('Wikilink extraction', () => {
  it('agrees with the PageBodyCodec parser for canonical, escaped, rejected and fenced forms', () => {
    const corpus = [
      'See [[duskwater]] and [[sera]].',
      String.raw`Literal \[\[duskwater\]\] and canonical [[sera]].`,
      'Rejected [[sera|Captain Sera]].',
      'Inline `[[duskwater]]` code and [[sera]].',
      '```md\n[[duskwater]]\n```\n\nOutside [[sera]].',
      '    [[duskwater]]\n\nOutside [[sera]].',
      '```md\n[[duskwater]]\n```not-a-close\n[[sera]]',
    ]

    for (const body of corpus) expect(extractWikilinkSlugs(body)).toEqual(parsedSlugs(body))
  })

  it('deduplicates repeated targets in document order', () => {
    expect(extractWikilinkSlugs('[[sera]], [[duskwater]], [[sera]]')).toEqual(['sera', 'duskwater'])
  })
})

describe('Backlink derivation', () => {
  const pages: Page[] = [
    page({
      slug: 'sera',
      title: 'Sera',
      category: 'characters',
      summary: 'A captain.',
    }),
    page({
      slug: 'watch-log',
      title: 'Watch Log',
      category: 'stories',
      body: 'At dusk, [[sera]] took command of the western watch.',
    }),
    page({
      slug: 'order-ember',
      title: 'Order of Ember',
      category: 'organizations',
      customProperties: [
        {
          key: 'members',
          label: 'Members',
          type: 'relation',
          targetCategories: ['characters'],
          value: ['sera'],
        },
      ],
    }),
    page({
      slug: 'era-drowning',
      title: 'The Drowning',
      category: 'eras',
    }),
    page({
      slug: 'duskwater',
      title: 'Duskwater',
      category: 'locations',
      eras: ['era-drowning'],
    }),
    page({
      slug: 'siege',
      title: 'The Siege',
      category: 'events',
      eras: ['era-drowning'],
      body: 'Sera fought beside [[sera]].',
      customProperties: [
        { key: 'participants', label: 'Participants', type: 'relation', value: ['sera'] },
      ],
    }),
  ]

  it('combines body Wikilinks and Relation values without duplicate source rows', () => {
    expect(deriveBacklinks(pages, 'sera')).toEqual([
      expect.objectContaining({ sourceSlug: 'siege', kinds: ['body', 'relation'] }),
      expect.objectContaining({ sourceSlug: 'order-ember', kinds: ['relation'] }),
      expect.objectContaining({ sourceSlug: 'watch-log', kinds: ['body'] }),
    ])
    expect(deriveBacklinks(pages, 'sera')[2].snippet).toContain('Sera')
  })

  it('lists an Era page members as live backlinks', () => {
    expect(deriveBacklinks(pages, 'era-drowning')).toEqual([
      expect.objectContaining({ sourceSlug: 'siege', kinds: ['era-membership'] }),
      expect.objectContaining({ sourceSlug: 'duskwater', kinds: ['era-membership'] }),
    ])
  })

  it('keeps self-references in the inverse index', () => {
    const self = page({
      slug: 'mirror',
      title: 'The Mirror',
      category: 'items',
      body: 'The inscription names [[mirror]].',
    })
    expect(deriveBacklinks([self], 'mirror')).toEqual([
      expect.objectContaining({ sourceSlug: 'mirror', kinds: ['body'] }),
    ])
  })
})
