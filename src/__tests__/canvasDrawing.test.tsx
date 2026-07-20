import { readFileSync } from 'node:fs'
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

async function renderCanvas() {
  render(
    <MemoryRouter initialEntries={['/w/ninth-vale?panel=canvas']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await act(async () => {})
  const stage = screen.getByTestId('reference-canvas-stage')
  stage.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}),
  })
  return stage
}

function stroke(stage: HTMLElement, tool: string, path: [number, number][]) {
  fireEvent.click(screen.getByRole('button', { name: tool }))
  fireEvent.pointerDown(stage, { button: 0, clientX: path[0][0], clientY: path[0][1], pointerId: 1 })
  for (const [x, y] of path.slice(1)) fireEvent.pointerMove(stage, { clientX: x, clientY: y, pointerId: 1 })
  const last = path[path.length - 1]
  fireEvent.pointerUp(stage, { clientX: last[0], clientY: last[1], pointerId: 1 })
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

describe('Reference canvas — drawing tools', () => {
  it('the pencil draws a smoothed stroke that persists to _world.md', async () => {
    const stage = await renderCanvas()
    stroke(stage, 'Pencil', [[100, 100], [140, 130], [180, 110]])

    const strokeEl = stage.querySelector('[data-kind="stroke"]')
    expect(strokeEl).toBeTruthy()
    expect(strokeEl!.querySelector('path')?.getAttribute('d')).toContain('Q')

    await waitFor(async () => {
      const saved = await repository.getWorld('ninth-vale')
      expect(saved?.canvas?.items.some((item) => item.kind === 'stroke')).toBe(true)
    })
    const reloaded = new LocalStorageWorldRepository(storage, fixtureFiles)
    expect((await reloaded.getWorld('ninth-vale'))?.canvas?.items.some((item) => item.kind === 'stroke')).toBe(true)
  })

  it('the eraser removes items along the pointer path', async () => {
    const stage = await renderCanvas()
    // The seeded sticky "note-tides" sits around page (120..328, 152..304).
    expect(screen.getByTestId('canvas-item-canvas-note-tides')).toBeTruthy()
    stroke(stage, 'Eraser', [[130, 200], [300, 260]])
    expect(screen.queryByTestId('canvas-item-canvas-note-tides')).toBeNull()
  })

  it('the laser draws a fading trail via rAF and adds no persisted items', async () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length })
    const stage = await renderCanvas()
    const before = within(stage).getAllByTestId(/^canvas-item-/).length

    stroke(stage, 'Laser', [[80, 80], [180, 120], [260, 90]])
    expect(screen.getByTestId('canvas-laser-path').getAttribute('d')).not.toBe('')
    expect(within(stage).getAllByTestId(/^canvas-item-/)).toHaveLength(before)
    expect(frames.length).toBeGreaterThan(0)
  })

  it('the world layer fills the stage so the laser/preview overlays have a paint box (#regression)', () => {
    // A content-sized (top/left:0 only) world collapses to 0x0, so the inset:0
    // laser and pencil-preview SVGs get a 0x0 viewport and never paint.
    const css = readFileSync('src/canvas/ReferenceCanvasPanel.module.css', 'utf8')
    expect(css).toMatch(/\.world \{[^}]*inset: 0;/)
  })

  it('the custom color picker authors an OKLCH color that applies to a new sticky and persists', async () => {
    const stage = await renderCanvas()

    fireEvent.click(screen.getByRole('button', { name: 'Color' }))
    const picker = screen.getByRole('group', { name: 'Color picker' })
    const area = within(picker).getByRole('slider', { name: 'Lightness and chroma' })
    const hue = within(picker).getByRole('slider', { name: 'Hue' })
    area.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 132, width: 200, height: 132, toJSON: () => ({}) })
    hue.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 16, width: 200, height: 16, toJSON: () => ({}) })

    fireEvent.pointerDown(hue, { clientX: 100, clientY: 8, pointerId: 1 }) // hue ≈ 180
    fireEvent.pointerDown(area, { clientX: 100, clientY: 33, pointerId: 1 }) // c ≈ half, l ≈ 0.75

    // A newly created sticky picks up the authored OKLCH color.
    fireEvent.click(screen.getByRole('button', { name: 'Sticky note' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 500, clientY: 460, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 460, pointerId: 1 })
    const editor = screen.getByRole('textbox', { name: 'Edit sticky note' })
    fireEvent.change(editor, { target: { value: 'Tinted' } })
    fireEvent.blur(editor)

    await waitFor(async () => {
      const saved = await repository.getWorld('ninth-vale')
      const note = saved?.canvas?.items.find((item) => item.kind === 'sticky' && item.text === 'Tinted')
      expect(note?.color).toMatch(/^oklch\(/)
    })
  })
})
