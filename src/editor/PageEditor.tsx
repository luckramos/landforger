// The editor core (issue #20): tiptap EditorContent + the design's persistent
// floating format toolbar (design-inventory.md §2.3 "Format toolbar",
// animation-catalog.md "format toolbar dock"). No selection bubble menu.
// `/`, `@` and `[[` are independent Suggestion plugins: slash inserts blocks;
// the other two insert the same canonical-by-Slug Wikilink node.

import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { pageBodyCodec } from './codec/TiptapMarkdownCodec'
import { buildBlockExtensions } from './extensions'
import { WikiLinkRegistry, type WikiLinkPage } from './WikiLinkRegistry'
import { icons } from '../icons'
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
  const initialDoc = useMemo(() => {
    const doc = pageBodyCodec.parse(body)
    // An empty Page parses to a doc with no blocks at all, which renders as a
    // bare contenteditable: no caret target and nothing for the placeholder to
    // hang on. Seed one paragraph so a new Page has somewhere to start.
    return doc.content?.length ? doc : { ...doc, content: [{ type: 'paragraph' }] }
  }, [body])

  const editor = useEditor({
    extensions: buildBlockExtensions({
      resolveTitle: (slug) => resolveTitleRef.current(slug),
      wikiLinkRegistry: registry,
      onWikiLinkNavigate: (slug) => navigateRef.current?.(slug),
      placeholder: 'Start writing, or press / for blocks',
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

  // Measure the content column so the fixed toolbar can be centered on the
  // document body — independent of the sidebar width or any ancestor that
  // might otherwise trap `position: fixed`.
  const contentRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<{ center: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setMetrics({ center: rect.left + rect.width / 2, width: rect.width })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [editor])

  return (
    <div className={styles.root} style={style} data-read-only={readOnly || undefined}>
      {editor && metrics && <Toolbar editor={editor} readOnly={readOnly} metrics={metrics} />}
      <div ref={contentRef} className={styles.content}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Format toolbar — floating pill, anchorable top/bottom via the segmented
// control on the bar itself. Active states via useEditorState selectors
// (v3: shouldRerenderOnTransaction is false, so the editor component itself
// never re-renders per keystroke — only this bar does, on selected changes).
// ---------------------------------------------------------------------------

interface ToolbarMetrics {
  /** Viewport x of the content column's center — the pill centers on this. */
  center: number
  width: number
}

function Toolbar({ editor, readOnly, metrics }: { editor: Editor; readOnly: boolean; metrics: ToolbarMetrics }) {
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

  return createPortal(
    <div
      className={anchor === 'bottom' ? `${styles.toolbarDock} ${styles.toolbarDockBottom}` : styles.toolbarDock}
      style={{ left: `${metrics.center}px`, maxWidth: `${metrics.width}px` }}
      aria-hidden={readOnly || undefined}
    >
      <div role="toolbar" aria-label="Format" className={styles.toolbar}>
        <ToolbarButton label="Undo" disabled={!s.canUndo} onRun={() => chain().undo().run()}>
          <icons.editorUndo size={17} />
        </ToolbarButton>
        <ToolbarButton label="Redo" disabled={!s.canRedo} onRun={() => chain().redo().run()}>
          <icons.editorRedo size={17} />
        </ToolbarButton>

        <span className={styles.divider} />

        <ToolbarButton label="Text" active={s.paragraph} onRun={() => chain().setParagraph().run()}>
          <icons.editorText size={17} />
        </ToolbarButton>
        <ToolbarButton label="Heading 1" active={s.h1} onRun={() => chain().toggleHeading({ level: 1 }).run()}>
          <icons.editorH1 size={17} />
        </ToolbarButton>
        <ToolbarButton label="Heading 2" active={s.h2} onRun={() => chain().toggleHeading({ level: 2 }).run()}>
          <icons.editorH2 size={17} />
        </ToolbarButton>
        <ToolbarButton label="Heading 3" active={s.h3} onRun={() => chain().toggleHeading({ level: 3 }).run()}>
          <icons.editorH3 size={17} />
        </ToolbarButton>

        <span className={styles.divider} />

        <ToolbarButton label="Bold" active={s.bold} onRun={() => chain().toggleBold().run()}>
          <icons.editorBold size={17} />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={s.italic} onRun={() => chain().toggleItalic().run()}>
          <icons.editorItalic size={17} />
        </ToolbarButton>
        <ToolbarButton label="Underline" active={s.underline} onRun={() => chain().toggleUnderline().run()}>
          <icons.editorUnderline size={17} />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" active={s.strike} onRun={() => chain().toggleStrike().run()}>
          <icons.editorStrike size={17} />
        </ToolbarButton>
        <ToolbarButton label="Highlight" active={s.highlight} onRun={() => chain().toggleHighlight().run()}>
          <icons.editorHighlight size={17} />
        </ToolbarButton>

        <span className={styles.divider} />

        <ToolbarButton label="Link" active={s.link} onRun={setLink}>
          <icons.editorLink size={17} />
        </ToolbarButton>
        <ToolbarButton label="Wikilink" onRun={() => chain().insertContent('@').run()}>
          <icons.editorWikilink size={17} />
        </ToolbarButton>

        <span className={styles.divider} />

        <ToolbarButton label="Bulleted list" active={s.bulletList} onRun={() => chain().toggleBulletList().run()}>
          <icons.editorBulletList size={17} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={s.orderedList} onRun={() => chain().toggleOrderedList().run()}>
          <icons.editorNumberedList size={17} />
        </ToolbarButton>
        <ToolbarButton label="To-do list" active={s.taskList} onRun={() => chain().toggleTaskList().run()}>
          <icons.editorTaskList size={17} />
        </ToolbarButton>
        <ToolbarButton label="Quote" active={s.blockquote} onRun={() => chain().toggleBlockquote().run()}>
          <icons.editorQuote size={17} />
        </ToolbarButton>

        <span className={styles.divider} />

        <div className={styles.segmented} role="group" aria-label="Toolbar position">
          <button
            type="button"
            className={anchor === 'top' ? styles.segmentActive : styles.segment}
            aria-label="Anchor toolbar to top"
            aria-pressed={anchor === 'top'}
            onClick={() => setAnchor('top')}
          >
            <icons.anchorTop size={13} />
          </button>
          <button
            type="button"
            className={anchor === 'bottom' ? styles.segmentActive : styles.segment}
            aria-label="Anchor toolbar to bottom"
            aria-pressed={anchor === 'bottom'}
            onClick={() => setAnchor('bottom')}
          >
            <icons.anchorBottom size={13} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
