// The editor core (issue #20): tiptap EditorContent + the design's persistent
// floating format toolbar (design-inventory.md §2.3 "Format toolbar",
// animation-catalog.md "format toolbar dock"). No selection bubble menu.
// `/`, `@` and `[[` are independent Suggestion plugins: slash inserts blocks;
// the other two insert the same canonical-by-Slug Wikilink node.

import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { pageBodyCodec } from './codec/TiptapMarkdownCodec'
import { buildBlockExtensions } from './extensions'
import { WikiLinkRegistry, type WikiLinkPage } from './WikiLinkRegistry'
import styles from './PageEditor.module.css'

export interface PageEditorProps {
  /** The Page body as Markdown — parsed through the PageBodyCodec on mount. */
  body: string
  /** Live title lookup for wikilink chips; unresolved Slugs render as Ghost links. */
  resolveTitle: (slug: string) => string | undefined
  /** Current World Pages used by suggestion search, live chips and previews. */
  pages?: WikiLinkPage[]
  /** Click-through for both resolved and Ghost links. */
  onNavigate?: (slug: string) => void
  /**
   * Called with the serialized Markdown body after every doc change.
   * Debouncing and the dirty check are the caller's concern (PageScreen).
   */
  onBodyChange?: (markdown: string) => void
  /** Read-only mode: content not editable, toolbar hidden. */
  readOnly?: boolean
  /**
   * Available width for the content column and the toolbar pill — becomes the
   * `--page-editor-width` CSS var (the sidebar arrives in #19 and will drive
   * this). Default: `min(760px, calc(100vw - 32px))`, centered.
   */
  width?: string
  /** Test seam: receive the editor instance once created. */
  onEditorReady?: (editor: Editor) => void
}

type ToolbarAnchor = 'top' | 'bottom'

export function PageEditor({
  body,
  resolveTitle,
  pages = [],
  onNavigate,
  onBodyChange,
  readOnly = false,
  width,
  onEditorReady,
}: PageEditorProps) {
  // Keep the lookup live without rebuilding the editor when the caller
  // re-renders with a new function identity.
  const resolveTitleRef = useRef(resolveTitle)
  resolveTitleRef.current = resolveTitle
  const navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate
  const registryRef = useRef<WikiLinkRegistry | null>(null)
  if (!registryRef.current) registryRef.current = new WikiLinkRegistry(pages)
  const registry = registryRef.current

  useEffect(() => {
    registry.update(pages)
  }, [pages, registry, resolveTitle])

  // Only the mount-time body is parsed — the editor owns the doc afterwards.
  const initialDoc = useMemo(() => pageBodyCodec.parse(body), [body])

  const editor = useEditor({
    extensions: buildBlockExtensions({
      resolveTitle: (slug) => resolveTitleRef.current(slug),
      wikiLinkRegistry: registry,
      onWikiLinkNavigate: (slug) => navigateRef.current?.(slug),
    }),
    content: initialDoc,
    editable: !readOnly,
    shouldRerenderOnTransaction: false,
    onCreate: ({ editor }) => onEditorReady?.(editor),
    onUpdate: ({ editor }) => onBodyChange?.(pageBodyCodec.serialize(editor.getJSON())),
  })

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  const style = width ? ({ '--page-editor-width': width } as CSSProperties) : undefined

  return (
    <div className={styles.root} style={style}>
      {!readOnly && editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className={styles.content} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Format toolbar — floating pill, anchorable top/bottom via the segmented
// control on the bar itself. Active states via useEditorState selectors
// (v3: shouldRerenderOnTransaction is false, so the editor component itself
// never re-renders per keystroke — only this bar does, on selected changes).
// ---------------------------------------------------------------------------

function Toolbar({ editor }: { editor: Editor }) {
  const [anchor, setAnchor] = useState<ToolbarAnchor>('top')

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
      paragraph: editor.isActive('paragraph'),
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      highlight: editor.isActive('highlight'),
      link: editor.isActive('link'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      taskList: editor.isActive('taskList'),
      blockquote: editor.isActive('blockquote'),
    }),
  })

  const chain = () => editor.chain().focus()

  const setLink = () => {
    if (s.link) {
      chain().unsetLink().run()
      return
    }
    // Minimal affordance for this slice — a proper link popover is later polish.
    const href = window.prompt('Link URL')
    if (href) chain().setLink({ href }).run()
  }

  return (
    <div
      role="toolbar"
      aria-label="Format"
      className={anchor === 'bottom' ? `${styles.toolbar} ${styles.toolbarBottom}` : styles.toolbar}
    >
      <ToolbarButton label="Undo" disabled={!s.canUndo} onRun={() => chain().undo().run()}>
        ↺
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={!s.canRedo} onRun={() => chain().redo().run()}>
        ↻
      </ToolbarButton>

      <span className={styles.divider} />

      <ToolbarButton label="Text" active={s.paragraph} onRun={() => chain().setParagraph().run()}>
        ¶
      </ToolbarButton>
      <ToolbarButton label="Heading 1" active={s.h1} onRun={() => chain().toggleHeading({ level: 1 }).run()}>
        H1
      </ToolbarButton>
      <ToolbarButton label="Heading 2" active={s.h2} onRun={() => chain().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton label="Heading 3" active={s.h3} onRun={() => chain().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>

      <span className={styles.divider} />

      <ToolbarButton label="Bold" active={s.bold} onRun={() => chain().toggleBold().run()}>
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton label="Italic" active={s.italic} onRun={() => chain().toggleItalic().run()}>
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton label="Underline" active={s.underline} onRun={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={s.strike} onRun={() => chain().toggleStrike().run()}>
        <s>S</s>
      </ToolbarButton>
      <ToolbarButton label="Inline code" active={s.code} onRun={() => chain().toggleCode().run()}>
        {'</>'}
      </ToolbarButton>
      <ToolbarButton label="Highlight" active={s.highlight} onRun={() => chain().toggleHighlight().run()}>
        ✺
      </ToolbarButton>

      <span className={styles.divider} />

      <ToolbarButton label="Link" active={s.link} onRun={setLink}>
        ⌁
      </ToolbarButton>
      <ToolbarButton label="Wikilink" onRun={() => chain().insertContent('@').run()}>
        @
      </ToolbarButton>

      <span className={styles.divider} />

      <ToolbarButton label="Bulleted list" active={s.bulletList} onRun={() => chain().toggleBulletList().run()}>
        ••
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={s.orderedList} onRun={() => chain().toggleOrderedList().run()}>
        1.
      </ToolbarButton>
      <ToolbarButton label="To-do list" active={s.taskList} onRun={() => chain().toggleTaskList().run()}>
        ☑
      </ToolbarButton>
      <ToolbarButton label="Quote" active={s.blockquote} onRun={() => chain().toggleBlockquote().run()}>
        ❝
      </ToolbarButton>

      <span className={styles.divider} />

      <div className={styles.segmented} role="group" aria-label="Toolbar position">
        <button
          type="button"
          className={anchor === 'top' ? styles.segmentActive : styles.segment}
          aria-pressed={anchor === 'top'}
          onClick={() => setAnchor('top')}
        >
          ↑ Top
        </button>
        <button
          type="button"
          className={anchor === 'bottom' ? styles.segmentActive : styles.segment}
          aria-pressed={anchor === 'bottom'}
          onClick={() => setAnchor('bottom')}
        >
          ↓ Bottom
        </button>
      </div>
    </div>
  )
}

interface ToolbarButtonProps {
  label: string
  onRun: () => void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}

function ToolbarButton({ label, onRun, active = false, disabled = false, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={active ? `${styles.button} ${styles.buttonActive}` : styles.button}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={label}
      // Keep the editor selection: don't let the button steal focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
    >
      {children}
    </button>
  )
}
