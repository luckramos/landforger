import type { Editor, Range } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from '@tiptap/react'
import { useState, useSyncExternalStore } from 'react'
import all13 from '../fixtures/all13.md?raw'
import {
  buildBlockExtensions,
  SlashMenu,
  WikiLink,
  wikiAtPluginKey,
  wikiBracketPluginKey,
} from './extensions'
import { registry } from './registry'
import { createListRender } from './suggestion-ui'

// ---------------------------------------------------------------------------
// WikiLink chip node view: live title looked up from the registry by slug.
// The label attr is never displayed — id is authoritative (ADR 0001).
// ---------------------------------------------------------------------------
function WikiLinkChip({ node }: NodeViewProps) {
  const title = useSyncExternalStore(registry.subscribe, () => registry.titleFor(node.attrs.id))
  const ghost = !registry.has(node.attrs.id)
  return (
    <NodeViewWrapper as="span" className={ghost ? 'chip ghost' : 'chip'} title={`[[${node.attrs.id}]]`}>
      {ghost ? `[[${node.attrs.id}]]` : title}
    </NodeViewWrapper>
  )
}

// ---------------------------------------------------------------------------
// Slash menu items — the 13 v1 blocks
// ---------------------------------------------------------------------------
type SlashItem = { title: string; run: (editor: Editor, range: Range) => void }

const SLASH_ITEMS: SlashItem[] = [
  { title: 'Text', run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: 'Heading 1', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: 'Heading 2', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: 'Heading 3', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { title: 'Bulleted list', run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: 'Numbered list', run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: 'To-do list', run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: 'Quote', run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: 'Callout', run: (e, r) => e.chain().focus().deleteRange(r).wrapIn('callout', { type: 'info' }).run() },
  { title: 'Toggle', run: (e, r) => e.chain().focus().deleteRange(r).setDetails().run() },
  { title: 'Divider', run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  {
    title: 'Image',
    run: (e, r) =>
      e.chain().focus().deleteRange(r).setImage({ src: 'https://placehold.co/480x160', alt: 'placeholder' }).run(),
  },
  {
    title: 'Mention (wikilink)',
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertContent([{ type: 'wikilink', attrs: { id: 'duskwater' } }, { type: 'text', text: ' ' }])
        .run(),
  },
]

// ---------------------------------------------------------------------------
// Editor extension set
// ---------------------------------------------------------------------------
type PageItem = { slug: string; title: string }

const pageItems = ({ query }: { query: string }): PageItem[] =>
  registry.entries().filter(p => p.title.toLowerCase().includes(query.toLowerCase()) || p.slug.includes(query.toLowerCase()))

const pageRender = () =>
  createListRender<PageItem>({
    label: p => `${p.title}  (${p.slug})`,
    onSelect: (item, props) => props.command({ id: item.slug } as any),
  })()

function buildAppExtensions() {
  const blocks = buildBlockExtensions().filter(e => e.name !== 'wikilink')
  return [
    ...blocks,
    WikiLink.extend({
      addNodeView() {
        return ReactNodeViewRenderer(WikiLinkChip)
      },
    }).configure({
      suggestions: [
        { char: '@', pluginKey: wikiAtPluginKey, items: pageItems, render: pageRender },
        { char: '[[', pluginKey: wikiBracketPluginKey, items: pageItems, render: pageRender },
      ],
    }),
    SlashMenu.configure({
      suggestion: {
        items: ({ query }: { query: string }) =>
          SLASH_ITEMS.filter(i => i.title.toLowerCase().includes(query.toLowerCase())),
        render: () =>
          createListRender<SlashItem>({
            label: i => i.title,
            onSelect: (item, props) => props.command(item as any),
          })(),
      },
    }),
    Markdown.configure({ markedOptions: { gfm: false } }),
  ]
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [md, setMd] = useState('')
  const [renamed, setRenamed] = useState(false)

  const editor = useEditor({
    extensions: buildAppExtensions(),
    content: all13,
    contentType: 'markdown',
    onCreate: ({ editor }) => setMd(editor.getMarkdown()),
    onUpdate: ({ editor }) => setMd(editor.getMarkdown()),
  })

  const rename = () => {
    registry.rename('duskwater', renamed ? 'Duskwater' : 'Duskwater Deep')
    setRenamed(!renamed)
    // deliberately NOT touching the editor/markdown — chips re-render from the
    // registry; the MD pane must stay unchanged (Q4).
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>tiptap codec spike (issue #15)</strong>
        <button onClick={rename}>
          {renamed ? "Rename 'Duskwater Deep' back to 'Duskwater'" : "Rename 'Duskwater' → 'Duskwater Deep'"}
        </button>
        <span className="hint">
          Q2 manual: type <code>/</code> (block menu), <code>@</code> (pages), <code>[[</code> (pages), a literal{' '}
          <code>[</code> (no popup must appear), and undo (Ctrl+Z) after each. Rename must re-render chips but NOT
          change the right pane.
        </span>
      </div>
      <div className="panes">
        <div className="pane">
          <EditorContent editor={editor} />
        </div>
        <pre className="pane md-pane">{md}</pre>
      </div>
    </div>
  )
}
