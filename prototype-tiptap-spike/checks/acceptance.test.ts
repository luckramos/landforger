// Acceptance checks for wayfinder ticket #15 — one file, structured per
// acceptance question, with a printed verdict block at the end.

import type { JSONContent } from '@tiptap/core'
import { Editor } from '@tiptap/core'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { createManager, parseMd, serializeMd } from '../src/codec'
import {
  buildBlockExtensions,
  SlashMenu,
  slashPluginKey,
  WikiLink,
  wikiAtPluginKey,
  wikiBracketPluginKey,
} from '../src/extensions'
import { registry } from '../src/registry'

const here = dirname(fileURLToPath(import.meta.url))
const all13 = readFileSync(join(here, '../fixtures/all13.md'), 'utf8')
const hostile = readFileSync(join(here, '../fixtures/hostile.md'), 'utf8')

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function countTypes(node: JSONContent, acc: Record<string, number> = {}): Record<string, number> {
  if (node.type) acc[node.type] = (acc[node.type] ?? 0) + 1
  node.content?.forEach(child => countTypes(child, acc))
  return acc
}

function textContent(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(textContent).join('')
}

function collect(node: JSONContent, type: string, out: JSONContent[] = []): JSONContent[] {
  if (node.type === type) out.push(node)
  node.content?.forEach(child => collect(child, type, out))
  return out
}

function unifiedDiff(aPath: string, bText: string, labelA: string, labelB: string): string {
  const bPath = join(tmpdir(), 'spike-normalized.md')
  writeFileSync(bPath, bText)
  try {
    execFileSync('diff', ['-u', '--label', labelA, '--label', labelB, aPath, bPath], {
      encoding: 'utf8',
    })
    return '(no differences)'
  } catch (e: any) {
    return e.stdout as string
  }
}

const verdicts: Array<{ q: string; pass: boolean; note: string }> = []
const record = (q: string, pass: boolean, note: string) => verdicts.push({ q, pass, note })

// ---------------------------------------------------------------------------
// Q1 — round-trip integrity
// ---------------------------------------------------------------------------

describe('Q1 round-trip integrity', () => {
  const p1 = parseMd(all13)
  const s1 = serializeMd(p1)
  const p2 = parseMd(s1)
  const s2 = serializeMd(p2)

  it('parse -> serialize -> parse loses zero nodes (same node-type counts)', () => {
    const c1 = countTypes(p1)
    const c2 = countTypes(p2)
    const pass = JSON.stringify(c1) === JSON.stringify(c2)
    record('Q1a zero node loss', pass, `counts ${JSON.stringify(c1)}`)
    expect(c2).toEqual(c1)
  })

  it('covers all 13 v1 blocks in the fixture', () => {
    const c1 = countTypes(p1)
    const needed = [
      'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'taskItem',
      'blockquote', 'callout', 'details', 'detailsSummary', 'detailsContent',
      'horizontalRule', 'image', 'wikilink',
    ]
    const missing = needed.filter(t => !c1[t])
    record('Q1b fixture coverage', missing.length === 0, missing.length ? `missing: ${missing}` : 'all block types present')
    expect(missing).toEqual([])
  })

  it('serialize(parse(serialized)) is idempotent after one normalization pass', () => {
    const pass = s2 === s1
    record('Q1c idempotence', pass, pass ? 'second pass byte-identical' : 'second pass DIFFERS')
    expect(s2).toBe(s1)
  })

  it('prints the normalization diff for human judgment', () => {
    const diff = unifiedDiff(join(here, '../fixtures/all13.md'), s1, 'all13.md (hand-written)', 'first normalization')
    console.log('\n----- Q1 normalization diff (hand-written -> first save) -----\n' + diff + '\n----- end diff -----\n')
    expect(true).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Q3 — dialect collisions
// ---------------------------------------------------------------------------

describe('Q3 dialect collisions', () => {
  it('(a) literal text [[not a link]] escapes on serialize and re-parses as text', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '[[not a link]]' }] },
      ],
    }
    const md = serializeMd(doc)
    const reparsed = parseMd(md)
    const noChip = collect(reparsed, 'wikilink').length === 0
    const textOk = textContent(reparsed) === '[[not a link]]'
    record('Q3a literal [[..]] escaping', noChip && textOk, `serialized as ${JSON.stringify(md.trim())}`)
    expect(md).toContain('\\[\\[not a link\\]\\]')
    expect(noChip).toBe(true)
    expect(textOk).toBe(true)
  })

  it('(b) hostile.md parses without throwing; shortcode stays text; table + fence degrade', () => {
    const doc = parseMd(hostile)
    const text = textContent(doc)

    const escapedStaysText =
      collect(doc, 'wikilink').length === 0 && text.includes('[[not a link]]')
    const shortcodeStaysText =
      collect(doc, 'mention').length === 0 && text.includes('[mention id="x"]')
    const tableDegrades =
      collect(doc, 'table').length === 0 && text.includes('| Name | Role |')
    const fenceDegrades =
      collect(doc, 'codeBlock').length === 0 && text.includes('[[duskwater]] inside a fence')
    // the fence text must NOT have materialized a chip either
    const fenceNoChip = !collect(doc, 'wikilink').some(n => n.attrs?.id === 'duskwater')

    record('Q3b hostile.md degradation', escapedStaysText && shortcodeStaysText && tableDegrades && fenceDegrades && fenceNoChip,
      `escaped=${escapedStaysText} shortcode=${shortcodeStaysText} table=${tableDegrades} fence=${fenceDegrades} fenceNoChip=${fenceNoChip}`)
    expect(escapedStaysText).toBe(true)
    expect(shortcodeStaysText).toBe(true)
    expect(tableDegrades).toBe(true)
    expect(fenceDegrades).toBe(true)
    expect(fenceNoChip).toBe(true)
  })

  it('(b2) FINDING: without our guard extension, @tiptap/markdown silently DROPS code fences', () => {
    const raw = createManager({ codeFenceGuard: false })
    const doc = raw.parse(hostile)
    const dropped = !textContent(doc).includes('inside a fence')
    console.log(`\nFINDING: raw manager (codeBlock disabled, no guard) ${dropped ? 'DROPS fenced code on parse — silent data loss' : 'keeps fenced code'}\n`)
    record('Q3b2 raw fence behavior (finding)', true, dropped ? 'raw manager drops fences silently; codec ships a 10-line guard' : 'raw manager keeps fences')
    expect(true).toBe(true)
  })

  it('(c) [[duskwater]] round-trips byte-identical', () => {
    const doc = parseMd('[[duskwater]]')
    const links = collect(doc, 'wikilink')
    const md = serializeMd(doc)
    const pass = links.length === 1 && links[0].attrs?.id === 'duskwater' && md === '[[duskwater]]'
    record('Q3c [[duskwater]] byte-identity', pass, `serialized bytes: ${JSON.stringify(md)}`)
    expect(links).toHaveLength(1)
    expect(links[0].attrs?.id).toBe('duskwater')
    expect(md).toBe('[[duskwater]]')
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

  function backlinksViaRegex(): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    for (const [page, md] of Object.entries(corpus)) {
      for (const m of md.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
        ;(map[m[1]] ??= []).push(page)
      }
    }
    Object.values(map).forEach(v => v.sort())
    return map
  }

  function backlinksViaParse(): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    for (const [page, md] of Object.entries(corpus)) {
      for (const node of collect(parseMd(md), 'wikilink')) {
        ;(map[node.attrs?.id] ??= []).push(page)
      }
    }
    Object.values(map).forEach(v => v.sort())
    return map
  }

  it('backlink index: raw-MD regex agrees with headless-parse JSON walk', () => {
    const viaRegex = backlinksViaRegex()
    const viaParse = backlinksViaParse()
    const pass = JSON.stringify(viaRegex) === JSON.stringify(viaParse)
    record('Q4a backlink agreement', pass, `index ${JSON.stringify(viaRegex)}`)
    expect(viaParse).toEqual(viaRegex)
  })

  it('MD bytes contain no titles; rename is registry-only (zero rewrites)', () => {
    const titles = ['Duskwater', 'Sera', 'The Ember Cycle']
    const bytes = Object.values(corpus).join('\n')
    const noTitles = titles.every(t => !bytes.includes(t))

    // serialize every page, then rename in the registry, then serialize again
    const before = Object.fromEntries(Object.entries(corpus).map(([k, md]) => [k, serializeMd(parseMd(md))]))
    registry.rename('duskwater', 'Duskwater Deep')
    const after = Object.fromEntries(Object.entries(corpus).map(([k, md]) => [k, serializeMd(parseMd(md))]))
    const unchanged = JSON.stringify(before) === JSON.stringify(after)

    record('Q4b rename = zero rewrites', noTitles && unchanged,
      `no titles in MD: ${noTitles}; serialized MD unchanged after registry rename: ${unchanged}`)
    expect(noTitles).toBe(true)
    expect(after).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// Q2 — interactive (manual); smoke: three distinct registered plugin keys
// ---------------------------------------------------------------------------

describe('Q2 triple-trigger smoke (full test is manual via npm run dev)', () => {
  it('all three Suggestion plugin keys are distinct and registered on one editor', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        ...buildBlockExtensions().filter(e => e.name !== 'wikilink'),
        WikiLink.configure({
          suggestions: [
            { char: '@', pluginKey: wikiAtPluginKey },
            { char: '[[', pluginKey: wikiBracketPluginKey },
          ],
        }),
        SlashMenu,
      ],
      content: '<p>smoke</p>',
    })
    const keys = [slashPluginKey, wikiAtPluginKey, wikiBracketPluginKey]
    const distinct = new Set(keys).size === 3
    const registered = keys.map(k => k.getState(editor.state) !== undefined)
    const pass = distinct && registered.every(Boolean)
    record('Q2 smoke: 3 distinct plugin keys', pass, `distinct=${distinct} registered=${registered}`)
    editor.destroy()
    expect(distinct).toBe(true)
    expect(registered).toEqual([true, true, true])
  })
})

// ---------------------------------------------------------------------------
// Verdict block
// ---------------------------------------------------------------------------

afterAll(() => {
  const lines = [
    '',
    '================ SPIKE VERDICT (issue #15) ================',
    ...verdicts.map(v => `${v.pass ? 'PASS' : 'FAIL'}  ${v.q} — ${v.note}`),
    '============================================================',
    'Q2 full answer is interactive: npm run dev, then try /, @, [[,',
    'literal [ typing, and undo after each.',
    '',
  ]
  console.log(lines.join('\n'))
})
