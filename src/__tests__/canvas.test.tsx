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

/** Give the stage a deterministic 1000x600 box so screen↔page maths is stable. */
function prepareStage() {
  const stage = screen.getByTestId('reference-canvas-stage')
  stage.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}),
  })
  return stage
}

function createItem(stage: HTMLElement, tool: string, at: [number, number]) {
  fireEvent.click(screen.getByRole('button', { name: tool }))
  fireEvent.pointerDown(stage, { button: 0, clientX: at[0], clientY: at[1], pointerId: 1 })
  fireEvent.pointerUp(stage, { clientX: at[0], clientY: at[1], pointerId: 1 })
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

describe('Reference canvas (mood board)', () => {
  it('opens refresh-safely with the reseeded fixture board inside the shared dockable window', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const dialog = await screen.findByRole('dialog', { name: 'Reference canvas' })
    expect(within(dialog).getAllByTestId(/^canvas-item-/)).toHaveLength(4)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Float window' }))
    expect(dialog.getAttribute('data-dock-state')).toBe('floating')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Minimize window' }))
    expect(dialog.getAttribute('data-dock-state')).toBe('minimized')
  })

  it('presents the workflow-grouped bottom toolbar with working and forthcoming tools', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const toolbar = await screen.findByRole('toolbar', { name: 'Canvas tools' })
    for (const tool of ['Select', 'Hand', 'Text', 'Sticky note']) {
      expect((within(toolbar).getByRole('button', { name: tool }) as HTMLButtonElement).disabled).toBe(false)
    }
    // The reference-node and connector tools remain disabled placeholders until
    // their slices land (the shell shows the whole workflow up front).
    for (const tool of ['Image', 'Link node', 'Link string']) {
      expect((within(toolbar).getByRole('button', { name: tool }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect(within(toolbar).getByRole('button', { name: 'Zoom in' })).toBeTruthy()
    expect(within(toolbar).getByRole('button', { name: 'Zoom out' })).toBeTruthy()
  })

  it('creates a text item that survives an empty blur (no silent auto-delete) and persists a sticky across reload', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()

    // Creating a text item and blurring it while empty must NOT delete it — a
    // stolen-focus blur used to destroy freshly created items on the spot.
    const before = within(stage).getAllByTestId(/^canvas-item-/).length
    createItem(stage, 'Text', [520, 520])
    const textEditor = screen.getByRole('textbox', { name: 'Edit canvas text' })
    fireEvent.blur(textEditor)
    expect(screen.queryByRole('textbox', { name: 'Edit canvas text' })).toBeNull() // editing ended
    expect(within(stage).getAllByTestId(/^canvas-item-/).length).toBe(before + 1) // …but the item stayed

    // A sticky with content persists.
    createItem(stage, 'Sticky note', [530, 400])
    const noteEditor = screen.getByRole('textbox', { name: 'Edit sticky note' })
    fireEvent.change(noteEditor, { target: { value: 'A persisted clue' } })
    fireEvent.blur(noteEditor)

    await waitFor(async () => {
      const saved = await repository.getWorld('ninth-vale')
      expect(saved?.canvas?.items.some((item) => item.kind === 'sticky' && item.text === 'A persisted clue')).toBe(true)
    })
    const reloaded = new LocalStorageWorldRepository(storage, fixtureFiles)
    const persisted = await reloaded.getWorld('ninth-vale')
    expect(persisted?.canvas?.items.some((item) => item.kind === 'sticky' && item.text === 'A persisted clue')).toBe(true)
    expect(persisted?.canvas?.links).toEqual([])
  })

  it('selects by geometry, marquee-contains, and clears on Escape', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()

    // A marquee that fully encloses the seeded cluster selects more than one item.
    fireEvent.pointerDown(stage, { button: 0, clientX: 40, clientY: 40 })
    fireEvent.pointerMove(stage, { clientX: 700, clientY: 560 })
    fireEvent.pointerUp(stage, { clientX: 700, clientY: 560 })
    expect(stage.querySelectorAll('[data-selected="true"]').length).toBeGreaterThan(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(stage.querySelectorAll('[data-selected="true"]')).toHaveLength(0)

    // Clicking empty space (transparent area) selects nothing.
    fireEvent.pointerDown(stage, { button: 0, clientX: 900, clientY: 60 })
    fireEvent.pointerUp(stage, { clientX: 905, clientY: 62 })
    expect(stage.querySelectorAll('[data-selected="true"]')).toHaveLength(0)
  })

  it('drags an item freely (no grid snap) and deletes the selection with the keyboard', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()

    const note = screen.getByTestId('canvas-item-canvas-note-tides')
    const startX = Number(note.getAttribute('data-x'))
    fireEvent.pointerDown(note, { button: 0, clientX: 200, clientY: 260, pointerId: 1 })
    expect(stage.getAttribute('data-live-item')).toBe('true')
    fireEvent.pointerMove(stage, { clientX: 237, clientY: 289, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 237, clientY: 289, pointerId: 1 })
    expect(stage.getAttribute('data-live-item')).toBeNull()
    // Free placement: moved by exactly the pointer delta (37), not snapped to a grid.
    expect(Number(note.getAttribute('data-x'))).toBe(startX + 37)

    fireEvent.keyDown(document, { key: 'Delete' })
    expect(screen.queryByTestId('canvas-item-canvas-note-tides')).toBeNull()
  })

  it('resizes from a handle and undo/redo reverts the geometry change', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()

    const note = screen.getByTestId('canvas-item-canvas-note-route')
    fireEvent.pointerDown(note, { button: 0, clientX: 480, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(note, { clientX: 480, clientY: 300, pointerId: 1 })
    const beforeWidth = Number(note.getAttribute('data-width'))

    const seHandle = screen.getByRole('button', { name: 'Resize sticky item se' })
    fireEvent.pointerDown(seHandle, { button: 0, clientX: 584, clientY: 376, pointerId: 1 })
    fireEvent.pointerMove(stage, { clientX: 680, clientY: 460, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 680, clientY: 460, pointerId: 1 })
    const afterWidth = Number(note.getAttribute('data-width'))
    expect(afterWidth).toBeGreaterThan(beforeWidth)

    fireEvent.keyDown(document, { key: 'z', metaKey: true })
    expect(Number(screen.getByTestId('canvas-item-canvas-note-route').getAttribute('data-width'))).toBe(beforeWidth)
    fireEvent.keyDown(document, { key: 'z', metaKey: true, shiftKey: true })
    expect(Number(screen.getByTestId('canvas-item-canvas-note-route').getAttribute('data-width'))).toBe(afterWidth)
  })

  it('pans with Space and zooms toward the cursor with the wheel', async () => {
    await renderAt('/w/ninth-vale?panel=canvas')
    const stage = prepareStage()

    fireEvent.keyDown(document, { code: 'Space' })
    fireEvent.pointerDown(stage, { button: 0, clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerMove(stage, { clientX: 340, clientY: 224, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 340, clientY: 224, pointerId: 1 })
    fireEvent.keyUp(document, { code: 'Space' })
    expect(stage.getAttribute('data-pan')).toBe('40,24')

    fireEvent.wheel(stage, { clientX: 500, clientY: 300, deltaY: -100 })
    expect(Number(stage.getAttribute('data-zoom'))).toBeGreaterThan(1)
  })
})
