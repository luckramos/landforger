// The editor core (issue #20): tiptap EditorContent + the design's persistent
// format toolbar (design-inventory.md §2.3 "Format toolbar",
// animation-catalog.md "format toolbar dock"). No selection bubble menu.
// `/`, `@` and `[[` are independent Suggestion plugins: slash inserts blocks;
// the other two insert the same canonical-by-Slug Wikilink node.

import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { pageBodyCodec } from './codec/TiptapMarkdownCodec'
import { buildBlockExtensions } from './extensions'
import { WikiLinkRegistry, type WikiLinkPage } from './WikiLinkRegistry'
import { icons } from '../icons'
import { useUiStore, type ToolbarAnchor } from '../state/uiStore'
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

  // Toolbar dock is a remembered user setting (persists across Pages/reloads).
  const anchor = useUiStore((state) => state.toolbarAnchor)
  const setToolbarAnchor = useUiStore((state) => state.setToolbarAnchor)

  // Anchor swap: the bar changes flex `order` (top ⇄ bottom of the sheet), which
  // can't be tweened. FLIP it instead — capture both boxes at the click, let the
  // layout settle, then animate each from its old spot to its new one so the bar
  // glides between docks and the text glides the other way (a coordinated morph).
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<{ bar?: DOMRect; content?: DOMRect } | null>(null)

  const changeAnchor = (next: ToolbarAnchor) => {
    if (next === anchor) return
    firstRef.current = {
      bar: wrapperRef.current?.getBoundingClientRect(),
      content: contentRef.current?.getBoundingClientRect(),
    }
    setToolbarAnchor(next)
  }

  useLayoutEffect(() => {
    const first = firstRef.current
    firstRef.current = null
    if (!first) return
    playFlip(wrapperRef.current, first.bar)
    playFlip(contentRef.current, first.content)
  }, [anchor])

  return (
    <div className={styles.root} style={style} data-read-only={readOnly || undefined}>
      {/* In-flow sticky bar (see Toolbar). Hidden entirely in read-only so it
          never reserves a row above a Page you can't edit. */}
      {editor && !readOnly && (
        <Toolbar editor={editor} anchor={anchor} onAnchor={changeAnchor} wrapperRef={wrapperRef} />
      )}
      <div ref={contentRef} className={styles.content}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// FLIP "Invert + Play": translate `el` from where it was (`first`) to where it
// now sits, then release to 0 — a slide with no layout thrash. Honors the
// motion scale (`--mo`) and the house curve; collapses to nothing under
// reduced-motion (and in tests, where getBoundingClientRect has no geometry).
function playFlip(el: HTMLElement | null, first: DOMRect | undefined) {
  if (!el || !first || typeof el.animate !== 'function') return
  const last = el.getBoundingClientRect()
  const dx = first.left - last.left
  const dy = first.top - last.top
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
  const cs = getComputedStyle(el)
  const mo = parseFloat(cs.getPropertyValue('--mo')) || 1
  const ease = cs.getPropertyValue('--ease-house').trim() || 'ease'
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  el.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
    { duration: reduced ? 0 : 340 * mo, easing: ease },
  )
}

// ---------------------------------------------------------------------------
// Format toolbar — an in-flow `position: sticky` pill, anchorable top/bottom
// via the segmented control on the bar itself. `.root` is a flex column, so the
// anchor just flips the bar's `order` around the content (no remount) while
// sticky keeps it pinned to the viewport and bounded to the editor sheet. The
// pill sizes to its content and centers on the column for free — no portal, no
// measurement. Active states via useEditorState selectors (v3:
// shouldRerenderOnTransaction is false, so the editor component itself never
// re-renders per keystroke — only this bar does, on selection changes).
// ---------------------------------------------------------------------------

function Toolbar({
  editor,
  anchor,
  onAnchor,
  wrapperRef,
}: {
  editor: Editor
  anchor: ToolbarAnchor
  onAnchor: (anchor: ToolbarAnchor) => void
  wrapperRef: RefObject<HTMLDivElement | null>
}) {
  // The bar belongs to the act of editing: it stays collapsed away while the
  // Page reads clean, then eases in when the writing surface takes focus.
  // Toolbar and anchor buttons preserve focus (mousedown preventDefault), so
  // using a tool never dismisses the bar mid-edit.
  const [editing, setEditing] = useState(editor.isFocused)
  useEffect(() => {
    const reveal = () => setEditing(true)
    const hide = () => setEditing(false)
    editor.on('focus', reveal)
    editor.on('blur', hide)
    return () => {
      editor.off('focus', reveal)
      editor.off('blur', hide)
    }
  }, [editor])

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
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

  return (
    <div
      ref={wrapperRef}
      className={anchor === 'bottom' ? `${styles.toolbarSticky} ${styles.toolbarStickyBottom}` : styles.toolbarSticky}
      data-visible={editing}
    >
      <div role="toolbar" aria-label="Format" className={styles.toolbar}>
        {/* Undo/redo live on the global ⌘Z / ⌘⇧Z; the freed space now holds the
            table tool with its Word-style row × column picker. */}
        <TableButton editor={editor} anchor={anchor} />

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
            // Keep editing focus so re-anchoring never collapses the bar.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAnchor('top')}
          >
            <icons.anchorTop size={13} />
          </button>
          <button
            type="button"
            className={anchor === 'bottom' ? styles.segmentActive : styles.segment}
            aria-label="Anchor toolbar to bottom"
            aria-pressed={anchor === 'bottom'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAnchor('bottom')}
          >
            <icons.anchorBottom size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// Table tool — a toolbar button opening a Word-style grid: sweep the pointer
// across the cells to size the table, click to insert. The picker is portaled
// to <body> (fixed-positioned from the button) so the toolbar's `overflow:
// hidden` reveal-clip never hides it. Keyboard users insert a table via `/table`.
function TableButton({ editor, anchor }: { editor: Editor; anchor: ToolbarAnchor }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const open = rect !== null

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || pickerRef.current?.contains(target)) return
      setRect(null)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRect(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const insert = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    setRect(null)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={open ? `${styles.button} ${styles.buttonActive}` : styles.button}
        aria-label="Insert table"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Insert table"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setRect(open ? null : (buttonRef.current?.getBoundingClientRect() ?? null))}
      >
        <icons.editorTable size={17} />
      </button>
      {rect && (
        <TableGridPicker
          ref={pickerRef}
          rect={rect}
          direction={anchor === 'bottom' ? 'up' : 'down'}
          onPick={insert}
        />
      )}
    </>
  )
}

const GRID_MAX = 8

const TableGridPicker = forwardRef<
  HTMLDivElement,
  { rect: DOMRect; direction: 'up' | 'down'; onPick: (rows: number, cols: number) => void }
>(function TableGridPicker({ rect, direction, onPick }, ref) {
  // 0-indexed hovered cell; the selection is the top-left (rows × cols) block.
  const [hover, setHover] = useState({ row: 0, col: 0 })
  const rows = hover.row + 1
  const cols = hover.col + 1
  const style: CSSProperties =
    direction === 'down'
      ? { top: rect.bottom + 6, left: rect.left }
      : { bottom: window.innerHeight - rect.top + 6, left: rect.left }

  return createPortal(
    <div
      ref={ref}
      className={`${styles.tablePicker} ${direction === 'up' ? styles.tablePickerUp : styles.tablePickerDown}`}
      style={style}
      role="dialog"
      aria-label="Table size"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className={styles.tableGrid} role="presentation">
        {Array.from({ length: GRID_MAX }).map((_, row) =>
          Array.from({ length: GRID_MAX }).map((_, col) => (
            <span
              key={`${row}-${col}`}
              className={row <= hover.row && col <= hover.col ? styles.tableGridOn : styles.tableGridOff}
              onMouseEnter={() => setHover({ row, col })}
              onClick={() => onPick(row + 1, col + 1)}
            />
          )),
        )}
      </div>
      <span className={styles.tableGridLabel}>{cols} × {rows}</span>
    </div>,
    document.body,
  )
})

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
