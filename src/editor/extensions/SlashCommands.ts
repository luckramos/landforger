import { Extension, type Editor, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Suggestion } from '@tiptap/suggestion'
import { suggestionMenuRenderer, type SuggestionMenuItem } from './SuggestionMenu'

interface SlashItem extends SuggestionMenuItem {
  keywords: string
  run: (editor: Editor, range: Range) => void
}

export const slashCommandsPluginKey = new PluginKey('slash-commands')

const blocks: SlashItem[] = [
  {
    id: 'text', label: 'Text', description: 'Plain paragraph', icon: '¶', keywords: 'paragraph',
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  ...([1, 2, 3] as const).map((level): SlashItem => ({
    id: `heading-${level}`,
    label: `Heading ${level}`,
    description: `Section heading level ${level}`,
    icon: `H${level}`,
    keywords: `h${level} title`,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHeading({ level }).run(),
  })),
  {
    id: 'bullet-list', label: 'Bulleted list', description: 'Unordered list', icon: '•', keywords: 'ul bullet',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'ordered-list', label: 'Numbered list', description: 'Ordered list', icon: '1.', keywords: 'ol number',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'task-list', label: 'To-do list', description: 'Checklist with tasks', icon: '☑', keywords: 'todo check task',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'quote', label: 'Quote', description: 'Quoted passage', icon: '❝', keywords: 'blockquote citation',
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'callout', label: 'Callout', description: 'Highlighted aside', icon: '✻', keywords: 'aside note warning',
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'callout', attrs: { type: 'info' }, content: [{ type: 'paragraph' }],
    }).run(),
  },
  {
    id: 'toggle', label: 'Toggle', description: 'Collapsible details', icon: '▸', keywords: 'details collapse',
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({
      type: 'details',
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
        { type: 'detailsContent', content: [{ type: 'paragraph' }] },
      ],
    }).run(),
  },
  {
    id: 'divider', label: 'Divider', description: 'Horizontal separator', icon: '—', keywords: 'rule hr separator',
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: 'image', label: 'Image', description: 'Insert an image URL', icon: '▧', keywords: 'picture photo',
    run: (editor, range) => {
      const src = window.prompt('Image URL')
      if (src) editor.chain().focus().deleteRange(range).setImage({ src }).run()
    },
  },
  {
    id: 'wikilink', label: 'Wikilink', description: 'Link another Page', icon: '@', keywords: 'page link reference',
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent('@').run(),
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
