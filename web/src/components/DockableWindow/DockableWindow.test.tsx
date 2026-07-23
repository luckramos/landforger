import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryStorage } from '../../__tests__/testStorage'
import { resetDockStore, setDockStorage, useDockStore } from '../../state/dockStore'
import { DockableWindow } from './DockableWindow'

beforeEach(() => {
  setDockStorage(createInMemoryStorage())
  resetDockStore()
  // These cases exercise the header controls, so the window must be open.
  useDockStore.getState().open('timeline')
})

afterEach(() => {
  setDockStorage(null)
  resetDockStore()
})

describe('DockableWindow', () => {
  it('morphs between fullscreen, floating and minimized states without unmounting its content', () => {
    render(
      <DockableWindow panelId="timeline" title="Timeline" subtitle="4 Eras" onClose={() => {}}>
        <p>Timeline body</p>
      </DockableWindow>,
    )

    const window = screen.getByRole('dialog', { name: 'Timeline' })
    expect(window.getAttribute('data-dock-state')).toBe('fullscreen')
    fireEvent.click(screen.getByRole('button', { name: 'Float window' }))
    expect(window.getAttribute('data-dock-state')).toBe('floating')
    expect(screen.getByText('Timeline body')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }))
    expect(window.getAttribute('data-dock-state')).toBe('minimized')
    expect(screen.getByText('Timeline body')).toBeTruthy()
    expect(screen.getByText('Timeline body').parentElement?.getAttribute('aria-hidden')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Restore window' }))
    expect(window.getAttribute('data-dock-state')).toBe('floating')
    expect(screen.getByText('Timeline body')).toBeTruthy()
  })

  it('suspends the geometry morph while a floating window is dragged', () => {
    render(
      <DockableWindow panelId="timeline" title="Timeline" onClose={() => {}}>
        body
      </DockableWindow>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Float window' }))
    const window = screen.getByRole('dialog', { name: 'Timeline' })
    const header = screen.getByTestId('dockable-drag-handle')
    fireEvent.pointerDown(header, { clientX: 200, clientY: 100 })
    expect(window.getAttribute('data-dragging')).toBe('true')
    fireEvent.pointerMove(document, { clientX: 240, clientY: 130 })
    fireEvent.pointerUp(document)
    expect(window.getAttribute('data-dragging')).toBeNull()

    const maximize = screen.getByRole('button', { name: 'Maximize window' })
    fireEvent.pointerDown(maximize, { clientX: 10, clientY: 10 })
    expect(window.getAttribute('data-dragging')).toBeNull()

    const resize = screen.getByRole('button', { name: 'Resize window' })
    fireEvent.pointerDown(resize, { clientX: 800, clientY: 600 })
    expect(window.getAttribute('data-dragging')).toBe('true')
    fireEvent.pointerUp(document)
  })

  it('cross-fades the float/maximize glyph instead of hard-swapping it, both glyphs coexisting mid-swap (#66)', () => {
    render(
      <DockableWindow panelId="timeline" title="Timeline" onClose={() => {}}>
        <p>Timeline body</p>
      </DockableWindow>,
    )

    const toggle = screen.getByRole('button', { name: 'Float window' })
    // Before any toggle, only the current mode's glyph is mounted.
    expect(toggle.querySelectorAll('[data-dock-mode-icon]')).toHaveLength(1)
    expect(toggle.querySelector('[data-dock-mode-icon]')?.getAttribute('data-dock-mode-icon')).toBe('fullscreen')

    fireEvent.click(toggle)

    // AnimatePresence keeps the outgoing glyph mounted alongside the incoming
    // one for the exit animation — a hard swap would remove the old glyph in
    // the same tick the new one appears, instead of letting both coexist.
    const midSwap = screen.getByRole('button', { name: 'Maximize window' })
    const glyphs = [...midSwap.querySelectorAll('[data-dock-mode-icon]')]
    expect(glyphs.length).toBeGreaterThanOrEqual(2)
    expect(glyphs.map((glyph) => glyph.getAttribute('data-dock-mode-icon')).sort()).toEqual(['floating', 'fullscreen'])
  })
})
