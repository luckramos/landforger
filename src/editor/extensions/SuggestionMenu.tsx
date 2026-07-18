// The shared popover behind all three editor suggestions (`/` blocks, `@`/`[[`
// wikilinks). tiptap's Suggestion plugin owns the trigger, filtering, caret and
// positioning; this module owns what the popover looks like and how the arrow
// keys move through it. It's a React tree mounted (via createRoot) into the
// element floating-ui positions, so it can reuse the app's anchored-menu motion
// (motionPrefs), Phosphor icons and the Property popovers' row vocabulary —
// the slash menu now reads as a sibling of the "Add property" type menu.
//
// Selection is *virtual*: the caret stays in the document, and the highlighted
// row is tracked by index (aria-selected + a bronze tint), scrolling itself
// into view on every move. tiptap forwards ↑/↓/Enter/etc. through `onKeyDown`,
// which returns true to consume the key or false to let the editor have it.

import { useEffect, useMemo, useRef, type ComponentType, type CSSProperties } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { motion } from 'motion/react'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { anchoredMenuRowVariants, anchoredMenuVariants } from '../../components/motionPrefs'
import type { IconProps } from '../../icons'
import styles from './SuggestionMenu.module.css'

export interface SuggestionMenuItem {
  id: string
  label: string
  description: string
  /** Phosphor icon component (rendered in the row's glyph tile). */
  icon: ComponentType<IconProps>
  /** Optional section heading; consecutive items sharing one are grouped under it. */
  group?: string
  /**
   * Optional accent color (a CSS color, e.g. `var(--cat-locations)`) that tints
   * this row's glyph and selected highlight — the `@` menu passes each Page's
   * Category color so a row reads with the same identity as its Wikilink chip.
   * Rows without it fall back to the house bronze.
   */
  accent?: string
}

interface MenuProps<T extends SuggestionMenuItem> {
  ariaLabel: string
  items: T[]
  selected: number
  onSelect: (item: T) => void
  onHover: (index: number) => void
}

/** Items in display order, split into the sections named by their `group`. */
function useSections<T extends SuggestionMenuItem>(items: T[]) {
  return useMemo(() => {
    const sections: { heading: string | undefined; items: { item: T; index: number }[] }[] = []
    items.forEach((item, index) => {
      const last = sections[sections.length - 1]
      if (last && last.heading === item.group) last.items.push({ item, index })
      else sections.push({ heading: item.group, items: [{ item, index }] })
    })
    return sections
  }, [items])
}

function SuggestionMenuList<T extends SuggestionMenuItem>({
  ariaLabel,
  items,
  selected,
  onSelect,
  onHover,
}: MenuProps<T>) {
  const sections = useSections(items)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Keep the highlighted row in view as the arrows walk past the scroll edge.
  useEffect(() => {
    rowRefs.current[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <motion.div
      className={styles.menu}
      role="listbox"
      aria-label={ariaLabel}
      variants={anchoredMenuVariants(1)}
      initial="hidden"
      animate="visible"
    >
      {items.length === 0 ? (
        <p className={styles.empty}>No matches</p>
      ) : (
        <div className={styles.list}>
          {sections.map((section, s) => (
            <div className={styles.section} key={section.heading ?? `s${s}`}>
              {section.heading && (
                <motion.p className={styles.groupHeading} variants={anchoredMenuRowVariants()} aria-hidden="true">
                  {section.heading}
                </motion.p>
              )}
              {section.items.map(({ item, index }) => {
                const Glyph = item.icon
                const isSelected = index === selected
                return (
                  <motion.button
                    type="button"
                    key={item.id}
                    ref={(el) => { rowRefs.current[index] = el }}
                    role="option"
                    aria-selected={isSelected}
                    aria-label={`${item.label} — ${item.description}`}
                    className={isSelected ? `${styles.option} ${styles.selected}` : styles.option}
                    style={item.accent ? ({ '--accent': item.accent } as CSSProperties) : undefined}
                    variants={anchoredMenuRowVariants()}
                    // Hover previews the selection; don't let the row steal the caret.
                    onMouseEnter={() => onHover(index)}
                    onMouseDown={(event) => { event.preventDefault(); onSelect(item) }}
                  >
                    <span className={styles.glyph} aria-hidden="true">
                      <Glyph size={16} />
                    </span>
                    <span className={styles.copy}>
                      <span className={styles.label}>{item.label}</span>
                      <span className={styles.description}>{item.description}</span>
                    </span>
                  </motion.button>
                )
              })}
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <p className={styles.footer} aria-hidden="true">
          <kbd>↑↓</kbd> navigate <span className={styles.footerDot}>·</span> <kbd>↵</kbd> select
        </p>
      )}
    </motion.div>
  )
}

/**
 * DOM renderer for a tiptap Suggestion. Bridges the imperative plugin lifecycle
 * to a React root and owns the virtual selection index the arrow keys move.
 */
export function suggestionMenuRenderer<T extends SuggestionMenuItem>(ariaLabel: string) {
  let element: HTMLDivElement | undefined
  let root: Root | undefined
  // The teardown returned by `props.mount` — it removes floating-ui's autoUpdate
  // AND the document-level "dismiss on outside pointerdown" listener. Dropping it
  // leaks a listener bound to the *previous* popover element; on the next open,
  // that stale listener sees the click as "outside" its now-detached element and
  // dismisses the live menu before the pick lands. That was the click-to-select bug.
  let unmount: (() => void) | undefined
  let current: SuggestionProps<T, T> | undefined
  let selected = 0

  const clamp = () => {
    selected = Math.min(Math.max(selected, 0), Math.max(0, (current?.items.length ?? 1) - 1))
  }

  const draw = () => {
    if (!root || !current) return
    clamp()
    root.render(
      <SuggestionMenuList
        ariaLabel={ariaLabel}
        items={current.items}
        selected={selected}
        onSelect={(item) => current?.command(item)}
        onHover={(index) => { selected = index; draw() }}
      />,
    )
  }

  return () => ({
    onStart(props: SuggestionProps<T, T>) {
      current = props
      selected = 0
      element = document.createElement('div')
      root = createRoot(element)
      draw()
      unmount = props.mount(element)
    },
    onUpdate(props: SuggestionProps<T, T>) {
      current = props
      selected = 0
      draw()
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (!current || current.items.length === 0) return false
      const count = current.items.length
      switch (event.key) {
        case 'ArrowDown':
          selected = (selected + 1) % count
          draw()
          return true
        case 'ArrowUp':
          selected = (selected - 1 + count) % count
          draw()
          return true
        case 'Home':
          selected = 0
          draw()
          return true
        case 'End':
          selected = count - 1
          draw()
          return true
        case 'Enter':
        case 'Tab':
          current.command(current.items[selected])
          return true
        default:
          return false
      }
    },
    onExit() {
      // Remove floating-ui + the outside-dismiss listener now (synchronous, so no
      // stale listener survives into the next open).
      unmount?.()
      unmount = undefined
      // Defer the React unmount: React forbids unmounting a root synchronously
      // from inside a lifecycle it's driving. A microtask is enough and the
      // popover is already detached by then.
      const dying = root
      root = undefined
      queueMicrotask(() => dying?.unmount())
      element = undefined
      current = undefined
    },
  })
}
