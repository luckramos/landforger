import { Extension, type Editor, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Suggestion } from '@tiptap/suggestion'
import { icons } from '../../icons'
import { suggestionMenuRenderer, type SuggestionMenuItem } from './SuggestionMenu'

interface SlashItem extends SuggestionMenuItem {
  keywords: string
  run: (editor: Editor, range: Range) => void
}

export const slashCommandsPluginKey = new PluginKey('slash-commands')

// Ordered by section so the flat arrow-key order matches the grouped display.
const blocks: SlashItem[] = [
  {
    id: 'text', group: 'Basic', label: 'Text', description: 'Plain paragraph', icon: icons.editorText, keywords: 'paragraph',
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  ...([1, 2, 3] as const).map((level): SlashItem => ({
    id: `heading-${level}`,
    group: 'Basic',
    label: `Heading ${level}`,
    description: `Section heading level ${level}`,
    icon: icons[`editorH${level}` as const],
    keywords: `h${level} title`,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHeading({ level }).run(),
  })),
  {
    id: 'bullet-list', group: 'Lists', label: 'Bulleted list', description: 'Unordered list', icon: icons.editorBulletList, keywords: 'ul bullet',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'ordered-list', group: 'Lists', label: 'Numbered list', description: 'Ordered list', icon: icons.editorNumberedList, keywords: 'ol number',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'task-list', group: 'Lists', label: 'To-do list', description: 'Checklist with tasks', icon: icons.editorTaskList, keywords: 'todo check task',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'quote', group: 'Blocks', label: 'Quote', description: 'Quoted passage', icon: icons.editorQuote, keywords: 'blockquote citation',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'callout', group: 'Blocks', label: 'Callout', description: 'Highlighted aside', icon: icons.editorCallout, keywords: 'aside note warning',
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'callout', attrs: { type: 'info' }, content: [{ type: 'paragraph' }],
    }).run(),
  },
  {
    id: 'toggle', group: 'Blocks', label: 'Toggle', description: 'Collapsible details', icon: icons.editorToggle, keywords: 'details collapse',
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'details',
      attrs: { open: true },
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
        { type: 'detailsContent', content: [{ type: 'paragraph' }] },
      ],
    }).run(),
  },
  {
    id: 'divider', group: 'Blocks', label: 'Divider', description: 'Horizontal separator', icon: icons.editorDivider, keywords: 'rule hr separator',
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: 'image', group: 'Insert', label: 'Image', description: 'Insert an image URL', icon: icons.typeImage, keywords: 'picture photo',
    // Drop the markdown template inline (no prompt dialog) with the `url`
    // placeholder selected, so the user types the link straight over it. Typing
    // the closing `)` themselves fires the image input rule and it renders.
    run: (editor, range) => {
      const from = range.from
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent('![alt](url)')
        // 'url' spans the 8th–10th chars of '![alt](url)'.
        .setTextSelection({ from: from + 7, to: from + 10 })
        .run()
    },
  },
  {
    id: 'wikilink', group: 'Insert', label: 'Wikilink', description: 'Link another Page', icon: icons.editorWikilink, keywords: 'page link reference',
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent('@').run(),
  },
  {
    id: 'table', group: 'Insert', label: 'Table', description: 'Grid of rows and columns', icon: icons.editorTable, keywords: 'grid rows columns cells',
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
]

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        pluginKey: slashCommandsPluginKey,
        startOfLine: true,
        items: ({ query }) => {
          const needle = query.toLocaleLowerCase()
          return blocks.filter((item) => `${item.label} ${item.keywords}`.toLocaleLowerCase().includes(needle))
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: suggestionMenuRenderer<SlashItem>('Blocks (/)'),
        placement: 'bottom-start',
        offset: { mainAxis: 7, crossAxis: 0 },
      }),
    ]
  },
})
