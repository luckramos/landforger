import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { resetDockStore, setDockStorage } from '../state/dockStore'
import { createInMemoryStorage } from './testStorage'

let repository: LocalStorageWorldRepository
let storage: Storage

async function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await act(async () => {})
}

function prepareStage() {
  const stage = screen.getByTestId('reference-canvas-stage')
  stage.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}),
  })
  return stage
}

function draw(stage: HTMLElement, tool: string, from: [number, number], to: [number, number]) {
  fireEvent.click(screen.getByRole('button', { name: tool }))
  fireEvent.pointerDown(stage, { button: 0, clientX: from[0], clientY: from[1], pointerId: 1 })
  fireEvent.pointerMove(stage, { clientX: to[0], clientY: to[1], pointerId: 1 })
  fireEvent.pointerUp(stage, { clientX: to[0], clientY: to[1], pointerId: 1 })
}

beforeEach(() => {
  storage = createInMemoryStorage()
  repository = new LocalStorageWorldRepository(storage, fixtureFiles)
  setRepository(repository)
  setDockStorage(createInMemoryStorage())
  resetDockStore()
})

afterEach(() => {
  setRepository(undefined)
  setDockStorage(null)
  vi.restoreAllMocks()
})

describe('Reference canvas', () => {
  it('opens refresh-safely with six fixture items inside the shared dockable window', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const dialog = await screen.findByRole('dialog', { name: 'Reference canvas' })
    expect(within(dialog).getAllByTestId(/^canvas-item-/)).toHaveLength(6)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Float window' }))
    expect(dialog.getAttribute('data-dock-state')).toBe('floating')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Minimize window' }))
    expect(dialog.getAttribute('data-dock-state')).toBe('minimized')
  })

  it('exposes ten functioning tools, nine shapes and a three-row color palette', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const toolbar = await screen.findByRole('toolbar', { name: 'Canvas tools' })
    for (const tool of ['Select / pan', 'Pencil', 'Arrow', 'Line', 'Dashed line', 'Shape', 'Text', 'Sticky note', 'Eraser', 'Laser pointer']) {
      expect(within(toolbar).getByRole('button', { name: tool })).toBeTruthy()
    }
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Shape' }))
    expect(screen.getAllByRole('option', { name: /shape$/i })).toHaveLength(9)
    expect(screen.getAllByRole('group', { name: /Canvas colors row/ })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy()
  })

  it('draws pencil, connectors and the selected shape, then snaps geometry to 8px', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()

    draw(stage, 'Pencil', [101, 101], [147, 123])
    draw(stage, 'Arrow', [200, 100], [277, 155])
    draw(stage, 'Line', [200, 180], [281, 221])
    draw(stage, 'Dashed line', [200, 260], [283, 303])
    fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
    fireEvent.click(screen.getByRole('option', { name: 'Star shape' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 420, clientY: 120 })
    fireEvent.pointerMove(stage, { clientX: 501, clientY: 197 })
    fireEvent.pointerUp(stage, { clientX: 501, clientY: 197 })

    expect(stage.querySelector('[data-kind="stroke"]')).toBeTruthy()
    expect(stage.querySelector('[data-kind="arrow"]')).toBeTruthy()
    expect(stage.querySelector('[data-kind="line"]')).toBeTruthy()
    expect(stage.querySelector('[data-kind="dashed"]')).toBeTruthy()
    const star = stage.querySelector('[data-shape="star"]')
    expect(star).toBeTruthy()
    expect(Number(star?.getAttribute('data-x')) % 8).toBe(0)
    expect(Number(star?.getAttribute('data-width')) % 8).toBe(0)
  })

  it('edits text on double-click, auto-deletes empty text, and persists sticky notes across reload', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 520, clientY: 520 })
    fireEvent.pointerUp(stage, { clientX: 520, clientY: 520 })
    const textEditor = screen.getByRole('textbox', { name: 'Edit canvas text' })
    fireEvent.change(textEditor, { target: { value: '' } })
    fireEvent.blur(textEditor)
    expect(screen.queryByRole('textbox', { name: 'Edit canvas text' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sticky note' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 530, clientY: 400 })
    fireEvent.pointerUp(stage, { clientX: 530, clientY: 400 })
    const noteEditor = screen.getByRole('textbox', { name: 'Edit sticky note' })
    fireEvent.change(noteEditor, { target: { value: 'A persisted clue' } })
    fireEvent.blur(noteEditor)

    await waitFor(async () => {
      const saved = await repository.getWorld('ninth-vale')
      expect(saved?.canvas?.items.some((item) => item.kind === 'sticky' && item.text === 'A persisted clue')).toBe(true)
    })
    const reloaded = new LocalStorageWorldRepository(storage, fixtureFiles)
    expect((await reloaded.getWorld('ninth-vale'))?.canvas?.items.some((item) => item.kind === 'sticky' && item.text === 'A persisted clue')).toBe(true)
  })

  it('marquee multi-selects, Delete removes selection, Escape clears it, and wheel zoom stays cursor-anchored', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()
    fireEvent.pointerDown(stage, { button: 0, clientX: 90, clientY: 80 })
    fireEvent.pointerMove(stage, { clientX: 350, clientY: 410 })
    fireEvent.pointerUp(stage, { clientX: 350, clientY: 410 })
    expect(stage.querySelectorAll('[data-selected="true"]').length).toBeGreaterThan(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(stage.querySelectorAll('[data-selected="true"]')).toHaveLength(0)
    fireEvent.pointerDown(stage, { button: 0, clientX: 90, clientY: 80 })
    fireEvent.pointerMove(stage, { clientX: 350, clientY: 410 })
    fireEvent.pointerUp(stage, { clientX: 350, clientY: 410 })
    const before = screen.getByTestId('canvas-item-canvas-note-tides')
    fireEvent.keyDown(document, { key: 'Delete' })
    expect(before.isConnected).toBe(false)

    fireEvent.wheel(stage, { clientX: 500, clientY: 300, deltaY: -100 })
    expect(Number(stage.getAttribute('data-zoom'))).toBeGreaterThan(1)
    expect(stage.getAttribute('data-pan')).not.toBe('0,0')
  })

  it('pans with Space and settles dragged and resized items onto the 8px grid', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()

    fireEvent.keyDown(document, { code: 'Space' })
    fireEvent.pointerDown(stage, { button: 0, clientX: 300, clientY: 200 })
    fireEvent.pointerMove(stage, { clientX: 340, clientY: 224 })
    fireEvent.pointerUp(stage, { clientX: 340, clientY: 224 })
    fireEvent.keyUp(document, { code: 'Space' })
    expect(stage.getAttribute('data-pan')).toBe('40,24')

    const worldLayer = stage.firstElementChild as HTMLElement
    worldLayer.getBoundingClientRect = () => ({
      x: 40, y: 24, left: 40, top: 24, right: 1040, bottom: 624, width: 1000, height: 600, toJSON: () => ({}),
    })
    const note = screen.getByTestId('canvas-item-canvas-note-tides')
    fireEvent.pointerDown(note, { button: 0, clientX: 160, clientY: 128 })
    expect(stage.getAttribute('data-live-item')).toBe('true')
    fireEvent.pointerMove(stage, { clientX: 195, clientY: 157 })
    fireEvent.pointerUp(stage, { clientX: 195, clientY: 157 })
    expect(stage.getAttribute('data-live-item')).toBeNull()
    expect(note.getAttribute('data-x')).toBe('152')

    const resize = screen.getByRole('button', { name: 'Resize sticky item' })
    fireEvent.pointerDown(resize, { button: 0, clientX: 328, clientY: 256 })
    fireEvent.pointerMove(stage, { clientX: 365, clientY: 282 })
    fireEvent.pointerUp(stage, { clientX: 365, clientY: 282 })
    expect(Number(note.getAttribute('data-width')) % 8).toBe(0)
  })

  it('draws and erases by pointer path while the laser uses rAF without adding canvas items', async () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()
    const initialCount = within(stage).getAllByTestId(/^canvas-item-/).length

    draw(stage, 'Laser pointer', [80, 80], [180, 120])
    expect(screen.getByTestId('canvas-laser-path').getAttribute('d')).not.toBe('')
    expect(within(stage).getAllByTestId(/^canvas-item-/)).toHaveLength(initialCount)
    expect(frames.length).toBeGreaterThan(0)

    draw(stage, 'Eraser', [120, 104], [220, 160])
    expect(screen.queryByTestId('canvas-item-canvas-note-tides')).toBeNull()
  })
})
