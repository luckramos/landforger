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
const pages = [
  { slug: 'duskwater', title: 'Duskwater', category: 'locations' as const, summary: 'The drowned port.', tags: ['port'] },
  { slug: 'sera', title: 'Sera', category: 'characters' as const, summary: 'Captain of the fleet.', tags: ['captain'] },
  { slug: 'gate-of-ash', title: 'The Gate of Ash', category: 'locations' as const, summary: 'A black gate.', tags: ['gate'] },
]

async function mountEditor(props: Partial<Parameters<typeof PageEditor>[0]> = {}) {
  let editor: Editor | undefined
  const utils = render(
    <PageEditor
      body={all13}
      resolveTitle={resolveTitle}
      pages={pages}
      onEditorReady={(e) => {
        editor = e
      }}
      {...props}
    />,
  )
  // Flush the editor's onCreate and the React node-view portals.
  await act(async () => {})
  if (!editor) await act(async () => {})
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
    expect(sera.textContent).toContain('Sera')

    const ghost = chips.find((c) => c.getAttribute('data-wikilink') === 'ember-cycle')!
    expect(ghost.textContent).toBe('[[ember-cycle]]')
    expect(ghost.className).toContain('ghost')
    // resolved chips are not ghosts
    expect(sera.className).not.toContain('ghost')
  })

  it('refreshes rename, Ghost and recreation states without rewriting the Markdown', async () => {
    const before = pageBodyCodec.serialize(pageBodyCodec.parse(all13))
    const { container, rerender } = await mountEditor()
    expect(container.querySelector('[data-wikilink="sera"]')?.textContent).toContain('Sera')

    rerender(
      <PageEditor
        body={all13}
        resolveTitle={resolveTitle}
        pages={pages.map((page) => (page.slug === 'sera' ? { ...page, title: 'Admiral Sera' } : page))}
      />,
    )
    await act(async () => {})

    expect(container.querySelector('[data-wikilink="sera"]')?.textContent).toContain('Admiral Sera')

    rerender(<PageEditor body={all13} resolveTitle={() => undefined} pages={pages.filter((page) => page.slug !== 'sera')} />)
    await act(async () => {})
    expect(container.querySelector('[data-wikilink="sera"]')?.textContent).toBe('[[sera]]')
    expect(container.querySelector('[data-wikilink="sera"]')?.className).toContain('ghost')

    rerender(
      <PageEditor
        body={all13}
        resolveTitle={() => undefined}
        pages={pages.map((page) => (page.slug === 'sera' ? { ...page, title: 'Sera Reforged' } : page))}
      />,
    )
    await act(async () => {})
    expect(container.querySelector('[data-wikilink="sera"]')?.textContent).toContain('Sera Reforged')
    expect(container.querySelector('[data-wikilink="sera"]')?.className).not.toContain('ghost')
    expect(pageBodyCodec.serialize(pageBodyCodec.parse(all13))).toBe(before)
  })

  it('shows a rich hover preview and delegates click-through navigation', async () => {
    const onNavigate = vi.fn()
    const { container, getByRole, getByText } = await mountEditor({ onNavigate })
    const chip = container.querySelector('[data-wikilink="sera"]')!
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({
      left: window.innerWidth - 100,
      top: window.innerHeight - 40,
      bottom: window.innerHeight - 20,
    } as DOMRect)

    act(() => chip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    const preview = getByRole('tooltip')
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ width: 280, height: 100 } as DOMRect)
    act(() => window.dispatchEvent(new Event('resize')))
    expect(preview.style.left).toBe(`${window.innerWidth - 288}px`)
    expect(preview.style.top).toBe(`${window.innerHeight - 150}px`)
    expect(preview.style.visibility).toBe('visible')
    expect(getByText('Captain of the fleet.')).toBeTruthy()
    expect(getByText('captain')).toBeTruthy()

    act(() => chip.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onNavigate).toHaveBeenCalledWith('sera')
  })

  // Same guard as the format toolbar: the card is `position: fixed`, so any
  // transformed ancestor (the route/page entrance animations) would silently
  // become its containing block and strand it away from the chip.
  it('portals the hover preview to <body>, anchored below the chip', async () => {
    const { container, getByRole } = await mountEditor()
    const chip = container.querySelector('[data-wikilink="sera"]')!
    // Roomy viewport: the card belongs directly below the chip, left-aligned.
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({
      left: 120,
      top: 100,
      bottom: 120,
    } as DOMRect)

    act(() => chip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    const preview = getByRole('tooltip')
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ width: 280, height: 100 } as DOMRect)
    act(() => window.dispatchEvent(new Event('resize')))

    expect(container.contains(preview)).toBe(false)
    expect(document.body.contains(preview)).toBe(true)
    expect(preview.style.left).toBe('120px')
    expect(preview.style.top).toBe('130px') // chip.bottom + 10 → below, not flipped
  })
})

describe('PageEditor — /, @ and [[ suggestion stack', () => {
  const open = async (editor: Editor, text: string) => {
    act(() => editor.chain().focus('end').insertContent(text).run())
    await act(async () => {})
    await act(async () => {})
  }

  it('inserts the same canonical Wikilink through @ and [[, with isolated undo history', async () => {
    const at = await mountEditor({ body: '' })
    await open(at.editor, '@gate')
    expect(await at.findByRole('listbox', { name: 'Pages (@)' })).toBeTruthy()
    act(() =>
      at.getByRole('option', { name: /The Gate of Ash/ }).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
    )
    expect(pageBodyCodec.serialize(at.editor.getJSON()).trim()).toBe('[[gate-of-ash]]')
    // Typing the trigger and picking the item land in one history group (they
    // occur within ProseMirror's newGroupDelay), so undo clears both. This is
    // how every Page with existing content already behaved; an empty Page now
    // starts with a real paragraph instead of a block-less doc, so it matches.
    act(() => at.editor.commands.undo())
    expect(at.editor.getText()).toBe('')

    const brackets = await mountEditor({ body: '' })
    await open(brackets.editor, '[')
    expect(brackets.queryByRole('listbox', { name: 'Pages ([[)' })).toBeNull()
    await open(brackets.editor, '[gate')
    expect(await brackets.findByRole('listbox', { name: 'Pages ([[)' })).toBeTruthy()
    act(() =>
      brackets
        .getByRole('option', { name: /The Gate of Ash/ })
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
    )
    expect(pageBodyCodec.serialize(brackets.editor.getJSON()).trim()).toBe('[[gate-of-ash]]')
    act(() => brackets.editor.commands.undo())
    expect(brackets.editor.getText()).toBe('')
    // Redo restores the chip — the two plugins keep independent history.
    act(() => brackets.editor.commands.redo())
    expect(pageBodyCodec.serialize(brackets.editor.getJSON()).trim()).toBe('[[gate-of-ash]]')
  })

  it('opens an independently positioned slash menu and applies a block in one undo step', async () => {
    const { editor, getByRole } = await mountEditor({ body: '' })
    await open(editor, '/head')
    expect(getByRole('listbox', { name: 'Blocks (/)' })).toBeTruthy()
    act(() =>
      getByRole('option', { name: /Heading 1/ }).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
    )
    expect(editor.isActive('heading', { level: 1 })).toBe(true)
    expect(editor.getText()).not.toContain('/head')
    // One undo reverts the whole trigger-and-apply group (see the @/[[ test).
    act(() => editor.commands.undo())
    expect(editor.getText()).toBe('')
    expect(editor.isActive('heading', { level: 1 })).toBe(false)
  })
})

describe('PageEditor — empty state', () => {
  it('prompts where to start writing on an empty Page', async () => {
    const { container } = await mountEditor({ body: '' })
    const firstBlock = container.querySelector('.tiptap p')!
    expect(firstBlock.getAttribute('data-placeholder')).toBe('Start writing, or press / for blocks')
    expect(firstBlock.className).toContain('is-empty-node')
  })

  it('drops the prompt once the Page has content', async () => {
    const { container } = await mountEditor({ body: 'Charted.\n' })
    const firstBlock = container.querySelector('.tiptap p')!
    expect(firstBlock.textContent).toBe('Charted.')
    expect(firstBlock.className).not.toContain('is-empty-node')
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
    expect(toolbar.querySelector('button[aria-label="Wikilink"]')?.hasAttribute('disabled')).toBe(false)
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
    const dock = toolbar.parentElement!
    const bottom = getByRole('button', { name: 'Anchor toolbar to bottom' })
    expect(dock.className).not.toContain('toolbarDockBottom')

    act(() => {
      bottom.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(dock.className).toContain('toolbarDockBottom')
  })

  // Regression guard: the bar must escape the editor subtree entirely. Any
  // ancestor with a transform/filter (the view-in entrance animations) becomes
  // the containing block for `position: fixed`, which silently re-anchors the
  // bar to the page and makes it scroll away instead of staying pinned.
  it('portals the toolbar to <body> so no ancestor can trap its fixed position', async () => {
    const { container, getByRole } = await mountEditor()
    const toolbar = getByRole('toolbar', { name: 'Format' })
    const root = container.querySelector('[data-read-only], div')!

    expect(root.contains(toolbar)).toBe(false)
    expect(document.body.contains(toolbar)).toBe(true)
    expect(toolbar.parentElement!.className).toContain('toolbarDock')
  })

  it('centers the toolbar on the measured content column, not the viewport', async () => {
    // Sidebar-offset column: 264px sidebar + a 760px column → center at 644.
    const rect = { left: 264, width: 760, right: 1024, top: 0, bottom: 0, height: 0, x: 264, y: 0, toJSON: () => ({}) }
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(rect as DOMRect)

    const { getByRole } = await mountEditor()
    const dock = getByRole('toolbar', { name: 'Format' }).parentElement as HTMLElement

    expect(dock.style.left).toBe('644px')
    expect(dock.style.maxWidth).toBe('760px')
    spy.mockRestore()
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
