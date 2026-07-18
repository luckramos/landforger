// The codec's permanent regression suite — the validated spike's acceptance
// checks (spike branch `spike/tiptap-codec`, issue #15), ported per issue #20.
// Structure kept per acceptance question:
//   Q1 round-trip integrity  ·  Q3 dialect collisions  ·  Q4 rename model &
//   backlink agreement. (The spike's Q2 — triple suggestion triggers — is
//   issue #21's slice and stayed behind.)

import type { JSONContent } from '@tiptap/core'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pageBodyCodec, TiptapMarkdownCodec } from '../codec/TiptapMarkdownCodec'

const here = dirname(fileURLToPath(import.meta.url))
const all13 = readFileSync(join(here, 'fixtures/all13.md'), 'utf8')
const hostile = readFileSync(join(here, 'fixtures/hostile.md'), 'utf8')

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function countTypes(node: JSONContent, acc: Record<string, number> = {}): Record<string, number> {
  if (node.type) acc[node.type] = (acc[node.type] ?? 0) + 1
  node.content?.forEach((child) => countTypes(child, acc))
  return acc
}

function textContent(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(textContent).join('')
}

function collect(node: JSONContent, type: string, out: JSONContent[] = []): JSONContent[] {
  if (node.type === type) out.push(node)
  node.content?.forEach((child) => collect(child, type, out))
  return out
}

// ---------------------------------------------------------------------------
// Q1 — round-trip integrity
// ---------------------------------------------------------------------------

describe('Q1 round-trip integrity', () => {
  const p1 = pageBodyCodec.parse(all13)
  const s1 = pageBodyCodec.serialize(p1)
  const p2 = pageBodyCodec.parse(s1)
  const s2 = pageBodyCodec.serialize(p2)

  it('parse -> serialize -> parse loses zero nodes (same node-type counts)', () => {
    expect(countTypes(p2)).toEqual(countTypes(p1))
  })

  it('covers all 13 v1 blocks in the fixture', () => {
    const c1 = countTypes(p1)
    const needed = [
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'taskList',
      'taskItem',
      'blockquote',
      'callout',
      'details',
      'detailsSummary',
      'detailsContent',
      'horizontalRule',
      'image',
      'wikilink',
    ]
    const missing = needed.filter((t) => !c1[t])
    expect(missing).toEqual([])
  })

  it('serialize(parse(serialized)) is idempotent after one normalization pass', () => {
    expect(s2).toBe(s1)
  })
})

// ---------------------------------------------------------------------------
// Q3 — dialect collisions
// ---------------------------------------------------------------------------

describe('Q3 dialect collisions', () => {
  it('(a) literal text [[not a link]] escapes on serialize and re-parses as text', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '[[not a link]]' }] }],
    }
    const md = pageBodyCodec.serialize(doc)
    const reparsed = pageBodyCodec.parse(md)
    expect(md).toContain('\\[\\[not a link\\]\\]')
    expect(collect(reparsed, 'wikilink')).toHaveLength(0)
    expect(textContent(reparsed)).toBe('[[not a link]]')
  })

  it('(b) hostile.md parses without throwing; shortcode stays text; pipe table renders; fence degrades', () => {
    const doc = pageBodyCodec.parse(hostile)
    const text = textContent(doc)

    // escaped \[\[..\]\] stays literal text, no chip
    expect(collect(doc, 'wikilink')).toHaveLength(0)
    expect(text).toContain('[[not a link]]')
    // the [mention id="x"] shortcode dialect is not ours — stays text
    expect(collect(doc, 'mention')).toHaveLength(0)
    expect(text).toContain('[mention id="x"]')
    // a standard pipe table now renders into a Table node (its cell text, not
    // the raw pipes, ends up in the document)
    expect(collect(doc, 'table')).toHaveLength(1)
    expect(collect(doc, 'tableHeader')).toHaveLength(2)
    expect(text).toContain('Captain')
    expect(text).not.toContain('| Name | Role |')
    // fenced code degrades to text via the CodeFenceAsText guard
    expect(collect(doc, 'codeBlock')).toHaveLength(0)
    expect(text).toContain('[[duskwater]] inside a fence')
    // and the fence text must NOT have materialized a chip either
    expect(collect(doc, 'wikilink').some((n) => n.attrs?.id === 'duskwater')).toBe(false)
  })

  it('(b4) a standard pipe table round-trips: parse builds the grid, serialize returns pipes', () => {
    const md = '| Name | Role |\n| --- | --- |\n| Sera | Captain |\n| Bram | Scout |'
    const doc = pageBodyCodec.parse(md)
    expect(collect(doc, 'table')).toHaveLength(1)
    expect(collect(doc, 'tableRow')).toHaveLength(3) // header + 2 body rows
    expect(collect(doc, 'tableHeader')).toHaveLength(2)
    expect(collect(doc, 'tableCell')).toHaveLength(4)

    const out = pageBodyCodec.serialize(doc)
    expect(out).toMatch(/\|.*Name.*\|.*Role.*\|/) // header row
    expect(out).toMatch(/\|[\s:|-]+-[\s:|-]+\|/) // separator row
    expect(out).toContain('Captain')
    // re-parsing the serialized markdown preserves the table intact
    expect(collect(pageBodyCodec.parse(out), 'tableCell')).toHaveLength(4)
  })

  it('(b2) FINDING: without the guard, @tiptap/markdown silently DROPS code fences', () => {
    // Canary for the pinned @tiptap/markdown behavior that makes the guard
    // necessary (spike README finding #2). If this fails after an upgrade,
    // upstream fixed the silent drop — re-evaluate CodeFenceAsText.
    const raw = new TiptapMarkdownCodec({ codeFenceGuard: false })
    const doc = raw.parse(hostile)
    expect(textContent(doc)).not.toContain('inside a fence')
  })

  it('(c) [[duskwater]] round-trips byte-identical', () => {
    const doc = pageBodyCodec.parse('[[duskwater]]')
    const links = collect(doc, 'wikilink')
    expect(links).toHaveLength(1)
    expect(links[0].attrs?.id).toBe('duskwater')
    expect(pageBodyCodec.serialize(doc)).toBe('[[duskwater]]')
  })

  it('(d) rejected [[slug|Label]] dialect stays literal text', () => {
    const doc = pageBodyCodec.parse('See [[duskwater|Duskwater]].')
    expect(collect(doc, 'wikilink')).toHaveLength(0)
    expect(textContent(doc)).toContain('[[duskwater|Duskwater]]')
  })
})

// ---------------------------------------------------------------------------
// Q4 — rename model & backlink agreement
// ---------------------------------------------------------------------------

describe('Q4 rename model & backlink agreement', () => {
  const corpus: Record<string, string> = {
    duskwater: 'Port city.\n\nAllied with [[sera]] during the [[ember-cycle]].',
    sera: 'Captain of the fleet.\n\nHolds court in [[duskwater]].',
    'ember-cycle': 'An era.\n\nShaped [[duskwater]] and made [[sera]] famous.',
  }

  // Must match src/__tests__/fixtures.test.ts's WIKILINK regex intent: the
  // backlink indexer scans raw MD; this asserts it agrees with a headless parse.
  function backlinksViaRegex(): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    for (const [page, md] of Object.entries(corpus)) {
      for (const m of md.matchAll(/\[\[([a-z0-9]+(?:-[a-z0-9]+)*)\]\]/g)) {
        ;(map[m[1]] ??= []).push(page)
      }
    }
    Object.values(map).forEach((v) => v.sort())
    return map
  }

  function backlinksViaParse(): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    for (const [page, md] of Object.entries(corpus)) {
      for (const node of collect(pageBodyCodec.parse(md), 'wikilink')) {
        ;(map[node.attrs?.id] ??= []).push(page)
      }
    }
    Object.values(map).forEach((v) => v.sort())
    return map
  }

  it('backlink index: raw-MD regex agrees with headless-parse JSON walk', () => {
    expect(backlinksViaParse()).toEqual(backlinksViaRegex())
  })

  it('MD bytes contain no titles; rename is registry-only (zero rewrites)', () => {
    // Titles live outside the files (resolveTitle at render time, ADR 0001).
    const titles = new Map<string, string>([
      ['duskwater', 'Duskwater'],
      ['sera', 'Sera'],
      ['ember-cycle', 'The Ember Cycle'],
    ])
    const bytes = Object.values(corpus).join('\n')
    for (const title of titles.values()) {
      expect(bytes).not.toContain(title)
    }

    // serialize every page, then rename in the registry, then serialize again
    const roundTrip = () =>
      Object.fromEntries(
        Object.entries(corpus).map(([k, md]) => [k, pageBodyCodec.serialize(pageBodyCodec.parse(md))]),
      )
    const before = roundTrip()
    titles.set('duskwater', 'Duskwater Deep')
    const after = roundTrip()
    expect(after).toEqual(before)
  })
})
