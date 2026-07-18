// PageEditor mounts under happy-dom (the spike's app-smoke check proved
// tiptap 3.27.4 renders fine there — no jsdom needed).

import type { Editor } from '@tiptap/core'
import { CellSelection } from '@tiptap/pm/tables'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pageBodyCodec } from '../codec/TiptapMarkdownCodec'
import { PageEditor } from '../PageEditor'
import { useUiStore } from '../../state/uiStore'

// The toolbar dock is a shared store setting; keep tests independent of the
// anchor a prior test may have left behind.
beforeEach(() => {
  useUiStore.setState({ toolbarAnchor: 'top', activeUserId: undefined })
})

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

  it('resolved chips render the category icon and carry --chip-cat; ghosts carry neither', async () => {
    const { container } = await mountEditor()
    const sera = container.querySelector('[data-wikilink="sera"]') as HTMLElement
    // Duotone category icon renders as an <svg> inside the chip.
    expect(sera.querySelector('svg')).toBeTruthy()
    // Category color is carried via the --chip-cat convention (same as Relation chips).
    expect(sera.style.getPropertyValue('--chip-cat')).toContain('--cat-characters')

    const ghost = container.querySelector('[data-wikilink="ember-cycle"]') as HTMLElement
    expect(ghost.querySelector('svg')).toBeNull()
    expect(ghost.style.getPropertyValue('--chip-cat')).toBe('')
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

  it('applies a picked block on a re-opened menu (no leaked dismiss listener)', async () => {
    // Regression: the popover renderer must tear down `props.mount`'s outside-
    // dismiss listener on exit. A leaked listener from a prior open fires on the
    // next menu's click and closes it before the pick lands — clicking a second
    // menu silently did nothing.
    const { editor, baseElement } = await mountEditor({ body: '' })
    await open(editor, '/head')
    act(() => editor.commands.setContent('<p></p>')) // close the first menu
    await act(async () => {})
    await open(editor, '/quote')
    const option = baseElement.querySelector('[role="option"][aria-label^="Quote"]') as HTMLElement
    act(() => {
      option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(editor.isActive('blockquote')).toBe(true)
  })

  it('tints @ suggestion rows with each Page Category color', async () => {
    const { editor, baseElement } = await mountEditor({ body: '' })
    await open(editor, '@gate')
    const option = baseElement.querySelector('[role="option"]') as HTMLElement
    // The Gate of Ash is a Location — the row carries its category accent so the
    // duotone icon and selected highlight read in the Category color.
    expect(option.getAttribute('style')).toContain('--accent: var(--cat-locations)')
  })
})

describe('PageEditor — markdown shortcuts while typing', () => {
  // Input rules fire through ProseMirror's handleTextInput; simulate typing the
  // last character so the rule sees the completed pattern at the caret.
  const typeClosing = (editor: Editor, prefix: string, last: string) => {
    act(() => editor.chain().focus().insertContent(prefix).run())
    const from = editor.state.selection.from
    act(() => {
      editor.view.someProp('handleTextInput', (fn) =>
        fn(editor.view, from, from, last, () => editor.state.tr),
      )
    })
  }

  it('turns [text](url) into a link', async () => {
    const { editor } = await mountEditor({ body: '' })
    typeClosing(editor, '[the gate](https://example.com', ')')
    expect(pageBodyCodec.serialize(editor.getJSON())).toContain('[the gate](https://example.com)')
  })

  it('turns ![alt](url) into an image without the link rule hijacking it', async () => {
    const { editor } = await mountEditor({ body: '' })
    typeClosing(editor, '![a map](https://example.com/map.png', ')')
    expect(editor.getJSON().content?.some((node) => node.type === 'image')).toBe(true)
  })
})

describe('PageEditor — markdown auto-convert on block exit', () => {
  // Leaving the block (here: a trailing Enter) converts any complete image/link
  // markdown — covering the orders the input rule can't: parens typed first,
  // the URL filled in after, or pasted markdown.
  const leaveBlock = (editor: Editor) =>
    act(() => editor.chain().focus('end').insertContent({ type: 'paragraph' }).run())

  it('converts an image whose ) was already there before the URL was filled in', async () => {
    const { editor } = await mountEditor({ body: '' })
    act(() => editor.chain().focus().insertContent('![alt]()').run())
    const openParen = editor.state.doc.textContent.indexOf('(')
    act(() => editor.commands.setTextSelection(1 + openParen + 1)) // between the parens
    act(() => editor.chain().insertContent('pic.png').run())
    leaveBlock(editor)
    expect(editor.getJSON().content?.some((node) => node.type === 'image')).toBe(true)
  })

  it('converts a link filled in after its parens, on block exit', async () => {
    const { editor } = await mountEditor({ body: '' })
    act(() => editor.chain().focus().insertContent('[the gate]()').run())
    const afterOpen = editor.state.doc.textContent.indexOf('](') + 2
    act(() => editor.commands.setTextSelection(1 + afterOpen))
    act(() => editor.chain().insertContent('https://example.com').run())
    leaveBlock(editor)
    let hasLink = false
    editor.state.doc.descendants((node) => {
      if (node.marks.some((mark) => mark.type.name === 'link')) hasLink = true
    })
    expect(hasLink).toBe(true)
  })

  it('leaves the untouched ![alt](url) placeholder as editable text', async () => {
    const { editor } = await mountEditor({ body: '' })
    act(() => editor.chain().focus().insertContent('![alt](url)').run())
    leaveBlock(editor)
    expect(editor.getJSON().content?.some((node) => node.type === 'image')).toBe(false)
    expect(editor.getText()).toContain('![alt](url)')
  })
})

describe('PageEditor — toggle block', () => {
  it('inserts an expanded, disclosable toggle', async () => {
    const { editor, container } = await mountEditor({ body: '' })
    act(() =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'details',
          attrs: { open: true },
          content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
            { type: 'detailsContent', content: [{ type: 'paragraph' }] },
          ],
        })
        .run(),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    // The `open` attribute only exists because Details is configured persist:true;
    // the node view mirrors it to the `.is-open` class that drives the caret + body.
    const details = container.querySelector('[data-type="details"]')!
    expect(details.className).toContain('is-open')
  })
})

describe('PageEditor — slash image', () => {
  it('drops the ![alt](url) template inline with the url placeholder selected', async () => {
    // No prompt dialog: the block types the markdown template and pre-selects the
    // link placeholder so the user replaces it in place.
    const { editor, baseElement } = await mountEditor({ body: '' })
    act(() => editor.chain().focus('end').insertContent('/image').run())
    await act(async () => {})
    await act(async () => {})
    const option = baseElement.querySelector('[role="option"][aria-label^="Image"]') as HTMLElement
    act(() => {
      option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(editor.getText()).toBe('![alt](url)')
    const { from, to } = editor.state.selection
    expect(editor.state.doc.textBetween(from, to)).toBe('url')
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
      // Undo/Redo dropped from the bar (global ⌘Z / ⌘⇧Z); the table tool took the space.
      'Insert table',
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
    // Undo/redo are no longer in the bar.
    expect(toolbar.querySelector('button[aria-label="Undo"]')).toBeNull()
    expect(toolbar.querySelector('button[aria-label="Redo"]')).toBeNull()
    expect(toolbar.querySelector('button[aria-label="Wikilink"]')?.hasAttribute('disabled')).toBe(false)
    // anchorable top/bottom via the segmented control on the bar
    expect(getByRole('group', { name: 'Toolbar position' })).toBeTruthy()
  })

  it('inserts a table at the size picked in the toolbar grid', async () => {
    const { editor, getByRole } = await mountEditor()
    act(() => { editor.chain().focus().setTextSelection(1).run() })

    fireEvent.click(getByRole('button', { name: 'Insert table' }))
    // The picker is portaled to <body>, so query it through `screen`.
    const picker = screen.getByRole('dialog', { name: 'Table size' })
    const grid = picker.querySelector('[role="presentation"]') as HTMLElement
    // Cell at row index 1, col index 2 → a 2-row × 3-column table.
    const target = grid.children[1 * 8 + 2] as HTMLElement
    fireEvent.mouseEnter(target)
    fireEvent.click(target)
    await act(async () => {})

    const nodes = (editor.getJSON().content ?? []) as Array<Record<string, any>>
    const table = nodes.find((node) => node.type === 'table')
    expect(table).toBeTruthy()
    expect(table?.content?.length).toBe(2) // 2 rows
    expect(table?.content?.[0].content?.length).toBe(3) // 3 columns
    expect(table?.content?.[0].content?.[0].type).toBe('tableHeader') // header row first
    expect(screen.queryByRole('dialog', { name: 'Table size' })).toBeNull() // picker closes after a pick
  })

  it('grows the rendered table with the append-column and append-row controls', async () => {
    const { editor, getByRole } = await mountEditor()
    act(() => { editor.chain().focus().setTextSelection(1).insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run() })
    await act(async () => {})

    const dims = () => {
      const table = (editor.getJSON().content ?? []).find((node) => node.type === 'table') as Record<string, any> | undefined
      return { rows: table?.content?.length, cols: table?.content?.[0].content?.length }
    }
    expect(dims()).toEqual({ rows: 2, cols: 2 })

    fireEvent.click(getByRole('button', { name: 'Add column' }))
    await act(async () => {})
    expect(dims()).toEqual({ rows: 2, cols: 3 })

    fireEvent.click(getByRole('button', { name: 'Add row' }))
    await act(async () => {})
    expect(dims()).toEqual({ rows: 3, cols: 3 })
  })

  it('deletes column, row, then the whole table through the per-cell kebab menu', async () => {
    const { editor, getByRole, container } = await mountEditor()
    act(() => { editor.chain().focus().setTextSelection(1).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() })
    await act(async () => {})

    const dims = () => {
      const table = (editor.getJSON().content ?? []).find((node) => node.type === 'table') as Record<string, any> | undefined
      return table ? { rows: table.content.length, cols: table.content[0].content.length } : null
    }
    const openKebab = () => {
      fireEvent.mouseMove(container.querySelector('.tiptap table td, .tiptap table th') as HTMLElement)
      fireEvent.click(getByRole('button', { name: 'Cell menu' }))
    }
    expect(dims()).toEqual({ rows: 3, cols: 3 })

    openKebab()
    fireEvent.click(getByRole('menuitem', { name: 'Delete column' }))
    await act(async () => {})
    expect(dims()).toEqual({ rows: 3, cols: 2 })

    openKebab()
    fireEvent.click(getByRole('menuitem', { name: 'Delete row' }))
    await act(async () => {})
    expect(dims()).toEqual({ rows: 2, cols: 2 })

    openKebab()
    fireEvent.click(getByRole('menuitem', { name: 'Delete table' }))
    await act(async () => {})
    expect(dims()).toBeNull()
  })

  it('previews the doomed cells on hover and toggles the header row from the kebab menu', async () => {
    const { editor, getByRole, container } = await mountEditor()
    act(() => { editor.chain().focus().setTextSelection(1).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() })
    await act(async () => {})

    fireEvent.mouseMove(container.querySelector('.tiptap table th') as HTMLElement)
    fireEvent.click(getByRole('button', { name: 'Cell menu' }))

    // Hovering "Delete column" draws a preview overlay over that column's cells
    // (3 rows). Overlays are drawn outside the ProseMirror-managed content so
    // its DOMObserver can't wipe them.
    const delColumn = getByRole('menuitem', { name: 'Delete column' })
    fireEvent.mouseEnter(delColumn)
    expect(container.querySelectorAll('[data-doom-cell]')).toHaveLength(3)
    fireEvent.mouseLeave(delColumn)
    expect(container.querySelectorAll('[data-doom-cell]')).toHaveLength(0)

    // Toggling the header row turns the first row's header cells into body cells.
    const firstRowTypes = () => {
      const table = (editor.getJSON().content ?? []).find((node) => node.type === 'table') as Record<string, any>
      return (table.content[0].content as Array<Record<string, any>>).map((cell) => cell.type)
    }
    expect(firstRowTypes().every((type) => type === 'tableHeader')).toBe(true)
    fireEvent.click(getByRole('menuitem', { name: 'Toggle header row' }))
    await act(async () => {})
    expect(firstRowTypes().every((type) => type === 'tableCell')).toBe(true)
  })

  it('removes the whole table when every cell is selected and Backspace is pressed', async () => {
    const { editor } = await mountEditor()
    act(() => { editor.chain().focus().setTextSelection(1).insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run() })
    await act(async () => {})

    // Select all cells (what a full drag across the grid produces), then Backspace.
    act(() => {
      const cellPositions: number[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'tableHeader' || node.type.name === 'tableCell') cellPositions.push(pos)
      })
      const selection = CellSelection.create(editor.state.doc, cellPositions[0], cellPositions[cellPositions.length - 1])
      editor.view.dispatch(editor.state.tr.setSelection(selection))
    })
    act(() => { editor.commands.keyboardShortcut('Backspace') })

    expect((editor.getJSON().content ?? []).some((node) => node.type === 'table')).toBe(false)
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
    expect(dock.className).not.toContain('toolbarStickyBottom')

    act(() => {
      bottom.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // Same element (no remount): the anchor flips its class + flex `order`.
    expect(dock.className).toContain('toolbarStickyBottom')
  })

  // The bar lives in the editor's own flow now (position: sticky), not a body
  // portal: it rides the page scroll and stays bounded to the sheet. Guard that
  // it renders inside `.root` alongside the content, wrapped in the sticky pill.
  it('renders the toolbar in-flow inside the editor, not portaled to <body>', async () => {
    const { container, getByRole } = await mountEditor()
    const toolbar = getByRole('toolbar', { name: 'Format' })
    const root = container.firstElementChild!

    expect(root.contains(toolbar)).toBe(true)
    const wrapper = toolbar.parentElement!
    expect(wrapper.className).toContain('toolbarSticky')
    expect(wrapper.parentElement).toBe(root)
  })

  it('reveals the bar only while the editor has focus', async () => {
    const { getByRole, editor } = await mountEditor()
    const wrapper = getByRole('toolbar', { name: 'Format' }).parentElement!
    // Reads clean until you start editing.
    expect(wrapper.getAttribute('data-visible')).toBe('false')

    act(() => editor.emit('focus', { editor, event: new FocusEvent('focus'), transaction: editor.state.tr }))
    expect(wrapper.getAttribute('data-visible')).toBe('true')

    act(() => editor.emit('blur', { editor, event: new FocusEvent('blur'), transaction: editor.state.tr }))
    expect(wrapper.getAttribute('data-visible')).toBe('false')
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
