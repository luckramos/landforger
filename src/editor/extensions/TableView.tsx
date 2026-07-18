// Table, re-skinned with a React node view. A rendered table carries the house
// surface, right/bottom "+" bars that append a column / row, and a per-cell
// actions menu: hovering a cell floats a kebab in its corner; clicking it moves
// the caret into that cell and opens a popover to delete that row, that column,
// the whole table, or toggle the header row. Hovering a delete item previews
// the cells that would go by tinting them (DOM-only, never touches the doc).
// Backspace with every cell selected removes the table (addKeyboardShortcuts).
//
// The kebab carries its own cell in state, and opening the menu pins the editor
// selection into that cell — so every command and the preview derive from the
// live selection, never from a ref that could go stale between hover and click.
// Node-view DOM stays valid table markup via `as="table"` +
// `contentDOMElementTag: 'tbody'`; controls sit outside the scroll element so
// its overflow never clips them.

import type { KeyboardShortcutCommand } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import { CellSelection, selectedRect } from '@tiptap/pm/tables'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { icons } from '../../icons'
import styles from './TableView.module.css'

type Doom = 'row' | 'column' | 'table' | null
interface Rect { left: number; top: number; width: number; height: number }

function TableNodeView({ editor, getPos }: NodeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const lastCellRef = useRef<HTMLElement | null>(null) // dedup only
  const menuRef = useRef<HTMLDivElement>(null)
  const kebabRef = useRef<HTMLButtonElement>(null)
  const [kebab, setKebab] = useState<{ left: number; top: number; cell: HTMLElement } | null>(null)
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null)
  const [doom, setDoom] = useState<Rect[] | null>(null)

  // Float the kebab in the hovered cell's top-right corner. Frozen while the
  // menu is open so moving toward it never shifts the target.
  const trackCell = (event: MouseEvent) => {
    if (menu) return
    const cell = (event.target as HTMLElement).closest('td, th') as HTMLElement | null
    const wrap = wrapRef.current
    if (!cell || !wrap || cell === lastCellRef.current) return
    lastCellRef.current = cell
    const wrapRect = wrap.getBoundingClientRect()
    const cellRect = cell.getBoundingClientRect()
    setKebab({ left: cellRect.right - wrapRect.left - 22, top: cellRect.top - wrapRect.top + 3, cell })
  }
  const clearHover = () => {
    if (menu) return
    lastCellRef.current = null
    setKebab(null)
  }

  // Ephemeral preview of what a delete would remove. Identified exactly like the
  // commands (prosemirror-tables' TableMap over the pinned selection), but drawn
  // as overlay rectangles positioned over the affected cells rather than by
  // adding a class to the <td>s: ProseMirror's DOMObserver treats a class it
  // didn't author as a foreign mutation and redraws the cell, wiping the class
  // the same instant. The overlays live outside the managed content, so they
  // survive.
  const preview = (kind: Doom) => {
    if (!kind) { setDoom(null); return }
    const wrap = wrapRef.current
    if (!wrap) return
    let rect
    try {
      rect = selectedRect(editor.state)
    } catch {
      return
    }
    const { map, tableStart } = rect
    const positions: number[] = []
    const at = (row: number, col: number) => positions.push(tableStart + map.map[row * map.width + col])
    if (kind === 'column') for (let row = 0; row < map.height; row += 1) at(row, rect.left)
    else if (kind === 'row') for (let col = 0; col < map.width; col += 1) at(rect.top, col)
    else for (let row = 0; row < map.height; row += 1) for (let col = 0; col < map.width; col += 1) at(row, col)

    const wrapRect = wrap.getBoundingClientRect()
    const rects: Rect[] = []
    for (const pos of positions) {
      // nodeDOM(pos) is the cell element itself (domAtPos would land on the row
      // boundary just before it and resolve to the <tr>).
      const cell = editor.view.nodeDOM(pos)
      if (!(cell instanceof HTMLElement)) continue
      const box = cell.getBoundingClientRect()
      rects.push({ left: box.left - wrapRect.left, top: box.top - wrapRect.top, width: box.width, height: box.height })
    }
    setDoom(rects)
  }

  const openMenu = () => {
    if (!kebab) return
    // Pin the caret inside the kebab's cell so the menu commands *and* the
    // preview (both read the pinned selection via selectedRect) resolve against it.
    editor.chain().focus().setTextSelection(editor.view.posAtDOM(kebab.cell, 0) + 1).run()
    setMenu({ left: Math.max(4, kebab.left - 150), top: kebab.top + 24 })
  }
  const closeMenu = () => {
    preview(null)
    setMenu(null)
  }

  useEffect(() => {
    if (!menu) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || kebabRef.current?.contains(target)) return
      closeMenu()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu])

  // The caret is already inside the target cell (openMenu pinned it), so the
  // command runs against the current selection.
  const run = (apply: (chain: ReturnType<typeof editor.chain>) => ReturnType<typeof editor.chain>) => {
    apply(editor.chain().focus()).run()
    closeMenu()
  }

  // Append a column after the last one: anchor in the last cell of the first row.
  const addColumn = () => {
    const pos = typeof getPos === 'function' ? getPos() : null
    if (pos == null) return
    const table = editor.state.doc.nodeAt(pos)
    if (!table || table.childCount === 0) return
    const firstRow = table.child(0)
    let cellStart = pos + 2
    for (let i = 0; i < firstRow.childCount - 1; i += 1) cellStart += firstRow.child(i).nodeSize
    editor.chain().focus().setTextSelection(cellStart + 2).addColumnAfter().run()
  }

  // Append a row after the last one: anchor in the first cell of the last row.
  const addRow = () => {
    const pos = typeof getPos === 'function' ? getPos() : null
    if (pos == null) return
    const table = editor.state.doc.nodeAt(pos)
    if (!table || table.childCount === 0) return
    let rowStart = pos + 1
    for (let i = 0; i < table.childCount - 1; i += 1) rowStart += table.child(i).nodeSize
    editor.chain().focus().setTextSelection(rowStart + 3).addRowAfter().run()
  }

  const stopBlur = (event: MouseEvent) => event.preventDefault()

  // Press feedback. `:active` is unreliable for buttons nested in a
  // contentEditable node view, so drive a transient `data-pressed` attribute the
  // scale keys off (removed on release / when the pointer leaves).
  const press = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => event.currentTarget.setAttribute('data-pressed', ''),
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => event.currentTarget.removeAttribute('data-pressed'),
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => event.currentTarget.removeAttribute('data-pressed'),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => event.currentTarget.removeAttribute('data-pressed'),
  }

  return (
    <NodeViewWrapper className={styles.host}>
      <div className={styles.wrap} ref={wrapRef} onMouseLeave={clearHover}>
        <div className={styles.scroll} onMouseMove={trackCell}>
          <NodeViewContent<'table'> as="table" className={styles.table} />
        </div>

        {doom && (
          <div className={styles.doomLayer} aria-hidden="true" contentEditable={false}>
            {doom.map((cell, index) => (
              <div
                key={index}
                className={styles.doomCell}
                data-doom-cell=""
                style={{ left: cell.left, top: cell.top, width: cell.width, height: cell.height }}
              />
            ))}
          </div>
        )}

        {editor.isEditable && (
          <>
            <button
              type="button"
              className={styles.addColumn}
              aria-label="Add column"
              title="Add column"
              contentEditable={false}
              onMouseDown={stopBlur}
              {...press}
              onClick={addColumn}
            >
              <icons.add size={14} />
            </button>
            <button
              type="button"
              className={styles.addRow}
              aria-label="Add row"
              title="Add row"
              contentEditable={false}
              onMouseDown={stopBlur}
              {...press}
              onClick={addRow}
            >
              <icons.add size={14} />
            </button>

            {kebab && (
              <button
                ref={kebabRef}
                type="button"
                className={styles.kebab}
                style={{ left: kebab.left, top: kebab.top }}
                aria-label="Cell menu"
                aria-haspopup="menu"
                aria-expanded={menu != null}
                contentEditable={false}
                onMouseDown={stopBlur}
                {...press}
                onClick={() => (menu ? closeMenu() : openMenu())}
              >
                <icons.kebab size={14} />
              </button>
            )}

            {menu && (
              <div
                ref={menuRef}
                className={styles.menu}
                style={{ left: menu.left, top: menu.top }}
                role="menu"
                aria-label="Cell actions"
                contentEditable={false}
                onMouseDown={stopBlur}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${styles.menuDanger}`}
                  onMouseEnter={() => preview('row')}
                  onMouseLeave={() => preview(null)}
                  {...press}
                  onClick={() => run((chain) => chain.deleteRow())}
                >
                  <icons.trash size={14} /> Delete row
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${styles.menuDanger}`}
                  onMouseEnter={() => preview('column')}
                  onMouseLeave={() => preview(null)}
                  {...press}
                  onClick={() => run((chain) => chain.deleteColumn())}
                >
                  <icons.trash size={14} /> Delete column
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${styles.menuDanger}`}
                  onMouseEnter={() => preview('table')}
                  onMouseLeave={() => preview(null)}
                  {...press}
                  onClick={() => run((chain) => chain.deleteTable())}
                >
                  <icons.trash size={14} /> Delete table
                </button>
                <span className={styles.menuDivider} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  {...press}
                  onClick={() => run((chain) => chain.toggleHeaderRow())}
                >
                  <icons.headerRow size={14} /> Toggle header row
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

/** Base Table + the house node view and a whole-table Backspace/Delete. */
export const TableWithTools = Table.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView, { contentDOMElementTag: 'tbody' })
  },

  // Selecting every cell (drag across the grid, or ⌘A inside it) and pressing
  // Backspace/Delete removes the whole table. Narrower selections fall through
  // to the default (which clears the selected cells' contents).
  addKeyboardShortcuts() {
    const parent = this.parent?.() ?? {}
    const removeIfWholeTable = (fallback?: KeyboardShortcutCommand): KeyboardShortcutCommand => (props) => {
      const { selection } = this.editor.state
      if (selection instanceof CellSelection && selection.isColSelection() && selection.isRowSelection()) {
        return this.editor.commands.deleteTable()
      }
      return fallback ? fallback(props) : false
    }
    return {
      ...parent,
      Backspace: removeIfWholeTable(parent.Backspace),
      Delete: removeIfWholeTable(parent.Delete),
    }
  },
})
