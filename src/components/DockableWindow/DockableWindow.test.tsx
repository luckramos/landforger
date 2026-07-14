import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DockableWindow } from './DockableWindow'

describe('DockableWindow', () => {
  it('morphs between fullscreen, floating and minimized states without unmounting its content', () => {
    render(
      <DockableWindow title="Timeline" subtitle="4 Eras" onClose={() => {}}>
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
      <DockableWindow title="Timeline" onClose={() => {}}>
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
})
