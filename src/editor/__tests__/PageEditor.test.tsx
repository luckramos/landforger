// PageEditor mounts under happy-dom (the spike's app-smoke check proved
// tiptap 3.27.4 renders fine there — no jsdom needed).

import type { Editor } from '@tiptap/core'
import { act, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { pageBodyCodec } from '../codec/TiptapMarkdownCodec'
import { PageEditor } from '../PageEditor'

const here = dirname(fileURLToPath(import.meta.url))
const all13 = readFileSync(join(here, 'fixtures/all13.md'), 'utf8')

const titles = new Map<string, string>([
  ['duskwater', 'Duskwater'],
  ['sera', 'Sera'],
  // 'ember-cycle' intentionally unresolved -> Ghost link
])
const resolveTitle = (slug: string) => titles.get(slug)

async function mountEditor(props: Partial<Parameters<typeof PageEditor>[0]> = {}) {
  let editor: Editor | undefined
  const utils = render(
    <PageEditor
      body={all13}
      resolveTitle={resolveTitle}
      onEditorReady={(e) => {
        editor = e
      }}
      {...props}
    />,
  )
  // Flush the editor's onCreate and the React node-view portals.
  await act(async () => {})
  return { ...utils, editor: editor! }
}

describe('PageEditor — 13 blocks render from a fixture body', () => {
  it('renders every v1 block type in the DOM', async () => {
    const { container } = await mountEditor()
    const tiptap = container.querySelector('.tiptap')!
    expect(tiptap).toBeTruthy()

    // Text, H1, H2, H3
    expect(tiptap.querySelector('p')).toBeTruthy()
    expect(tiptap.querySelector('h1')?.textContent).toBe('Duskwater')
    expect(tiptap.querySelector('h2')).toBeTruthy()
    expect(tiptap.querySelector('h3')).toBeTruthy()
    // Bulleted, Numbered, To-do
    expect(tiptap.querySelector('ul:not([data-type])')).toBeTruthy()
    expect(tiptap.querySelector('ol')).toBeTruthy()
    expect(tiptap.querySelector('ul[data-type="taskList"] input[type="checkbox"]')).toBeTruthy()
    // Quote, Callout, Toggle, Divider, Image
    expect(tiptap.querySelector('blockquote')).toBeTruthy()
    expect(tiptap.querySelector('div[data-callout="info"]')).toBeTruthy()
    expect(tiptap.querySelector('div[data-type="details"]')).toBeTruthy()
    expect(tiptap.querySelector('hr')).toBeTruthy()
    expect(tiptap.querySelector('img[src="https://example.com/duskwater-map.png"]')).toBeTruthy()
    // Wikilink chips
    expect(tiptap.querySelectorAll('[data-wikilink]').length).toBeGreaterThan(0)
  })

  it('wikilink chips render the LIVE title by slug; unresolved slugs go ghost', async () => {
    const { container } = await mountEditor()
    const chips = [...container.querySelectorAll('[data-wikilink]')]
    const sera = chips.find((c) => c.getAttribute('data-wikilink') === 'sera')!
    expect(sera.textContent).toBe('Sera')

    const ghost = chips.find((c) => c.getAttribute('data-wikilink') === 'ember-cycle')!
    expect(ghost.textContent).toBe('[[ember-cycle]]')
    expect(ghost.className).toContain('ghost')
    // resolved chips are not ghosts
    expect(sera.className).not.toContain('ghost')
  })
})

describe('PageEditor — toolbar', () => {
  it('shows the full design button set and the anchor segmented control', async () => {
    const { getByRole } = await mountEditor()
    const toolbar = getByRole('toolbar', { name: 'Format' })
    const labels = [
      'Undo',
      'Redo',
      'Text',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Inline code',
      'Highlight',
      'Link',
      'Wikilink',
      'Bulleted list',
      'Numbered list',
      'To-do list',
      'Quote',
    ]
    for (const label of labels) {
      expect(toolbar.querySelector(`button[aria-label="${label}"]`)).toBeTruthy()
    }
    // @ is a visual stub until issue #21 lands the mention menu
    expect(toolbar.querySelector('button[aria-label="Wikilink"]')?.hasAttribute('disabled')).toBe(true)
    // anchorable top/bottom via the segmented control on the bar
    expect(getByRole('group', { name: 'Toolbar position' })).toBeTruthy()
  })

  it('toggles bold on the current selection and reflects active state', async () => {
    const { editor, getByRole } = await mountEditor()
    // select the word "Duskwater" in the H1 (doc position 1..10)
    act(() => {
      editor.chain().setTextSelection({ from: 1, to: 10 }).run()
    })
    const bold = getByRole('toolbar', { name: 'Format' }).querySelector('button[aria-label="Bold"]')!
    expect(bold.getAttribute('aria-pressed')).toBe('false')

    act(() => {
      bold.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(editor.isActive('bold')).toBe(true)
    expect(bold.getAttribute('aria-pressed')).toBe('true')

    act(() => {
      bold.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(editor.isActive('bold')).toBe(false)
  })

  it('anchors bottom/top through the segmented control', async () => {
    const { getByRole } = await mountEditor()
    const toolbar = getByRole('toolbar', { name: 'Format' })
    const bottom = getByRole('button', { name: '↓ Bottom' })
    expect(toolbar.className).not.toContain('toolbarBottom')

    act(() => {
      bottom.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(toolbar.className).toContain('toolbarBottom')
  })

  it('is hidden when readOnly, and the content is not editable', async () => {
    const { container, queryByRole, editor } = await mountEditor({ readOnly: true })
    expect(queryByRole('toolbar')).toBeNull()
    expect(editor.isEditable).toBe(false)
    expect(container.querySelector('.tiptap')?.getAttribute('contenteditable')).toBe('false')
  })
})

describe('PageEditor — change notification', () => {
  it('serializes through the codec on doc changes', async () => {
    const onBodyChange = vi.fn()
    const { editor } = await mountEditor({ onBodyChange })
    act(() => {
      editor.chain().focus('end').insertContent('Amended closing line.').run()
    })
    expect(onBodyChange).toHaveBeenCalled()
    const md = onBodyChange.mock.calls.at(-1)![0] as string
    expect(md).toContain('Amended closing line.')
    expect(md).toContain('# Duskwater')
    expect(md).toContain('[[sera]]') // wikilinks serialize per ADR 0001
  })
})

describe('PageEditor — insertability & input rules', () => {
  it('inserts every v1 block via commands and round-trips through the codec', async () => {
    const { editor } = await mountEditor({ body: '' })
    act(() => {
      editor.commands.insertContent([
          { type: 'paragraph', content: [{ type: 'text', text: 'para' }] },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'h1' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'h2' }] },
          { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'h3' }] },
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bullet' }] }] },
            ],
          },
          {
            type: 'orderedList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ordered' }] }] },
            ],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }],
              },
            ],
          },
          { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quote' }] }] },
          {
            type: 'callout',
            attrs: { type: 'warning' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'callout body' }] }],
          },
          {
            type: 'details',
            content: [
              { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
              {
                type: 'detailsContent',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden' }] }],
              },
            ],
          },
          { type: 'horizontalRule' },
          { type: 'image', attrs: { src: 'https://example.com/x.png' } },
          {
            type: 'paragraph',
            content: [{ type: 'wikilink', attrs: { id: 'sera' } }],
          },
      ])
    })

    // Also prove toolbar-facing toggles can create the list/quote blocks from a blank para
    act(() => {
      editor.chain().focus('start').setTextSelection(1).toggleBulletList().run()
    })
    expect(editor.isActive('bulletList')).toBe(true)

    const md = pageBodyCodec.serialize(editor.getJSON())
    const reparsed = pageBodyCodec.parse(md)
    const types = new Set<string>()
    const walk = (n: { type?: string; content?: unknown[] }) => {
      if (n.type) types.add(n.type)
      for (const c of n.content ?? []) walk(c as { type?: string; content?: unknown[] })
    }
    walk(reparsed)
    for (const needed of [
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'taskList',
      'blockquote',
      'callout',
      'details',
      'horizontalRule',
      'image',
      'wikilink',
    ]) {
      expect(types.has(needed)).toBe(true)
    }
  })

  it('keeps heading/list nodes (and their input rules) and drops codeBlock entirely', async () => {
    const { editor } = await mountEditor({ body: '' })
    // Disabling StarterKit's codeBlock removes the node AND its ``` input rule
    expect(editor.schema.nodes.codeBlock).toBeUndefined()
    expect(editor.schema.nodes.heading).toBeTruthy()
    expect(editor.schema.nodes.bulletList).toBeTruthy()
    expect(editor.schema.nodes.orderedList).toBeTruthy()
    expect(editor.schema.nodes.blockquote).toBeTruthy()
  })
})
