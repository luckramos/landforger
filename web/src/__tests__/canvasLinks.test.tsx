import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasItem } from '../canvas/types'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { resetDockStore, setDockStorage } from '../state/dockStore'
import { createInMemoryStorage } from './testStorage'

let repository: LocalStorageWorldRepository
let storage: Storage

function sticky(id: string, x: number, y: number): CanvasItem {
  return { id, kind: 'sticky', x, y, width: 80, height: 60, rotation: 0, color: '#d8aa61', text: id }
}

async function renderWith(items: CanvasItem[]) {
  await repository.updateWorld('ninth-vale', { canvas: { items, links: [] } })
  render(
    <MemoryRouter initialEntries={['/w/ninth-vale?panel=canvas']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await act(async () => {})
  const stage = screen.getByTestId('reference-canvas-stage')
  stage.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}) }) as DOMRect
  const world = stage.firstElementChild as HTMLElement
  world.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}) }) as DOMRect
  return stage
}

/** Drag with the Link tool from a point over item A to a point over item B. */
function drawLink(stage: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.click(screen.getByRole('button', { name: 'Link string' }))
  fireEvent.pointerDown(stage, { button: 0, clientX: from[0], clientY: from[1], pointerId: 1 })
  fireEvent.pointerMove(document, { clientX: to[0], clientY: to[1], pointerId: 1 })
  fireEvent.pointerUp(document, { clientX: to[0], clientY: to[1], pointerId: 1 })
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

describe('Reference canvas — N-to-N link connector', () => {
  it('creates links with the Link tool; an item can hold many (N-to-N); links persist', async () => {
    const stage = await renderWith([sticky('a', 100, 100), sticky('b', 400, 100), sticky('c', 400, 400)])

    drawLink(stage, [140, 130], [440, 130]) // a → b
    drawLink(stage, [140, 130], [440, 430]) // a → c (shares endpoint a)

    await waitFor(() => expect(stage.querySelectorAll('[data-testid^="canvas-link-"]')).toHaveLength(2))
    await waitFor(async () => {
      const saved = await repository.getWorld('ninth-vale')
      expect(saved?.canvas?.links).toHaveLength(2)
      expect(saved?.canvas?.links.every((l) => l.fromId === 'a')).toBe(true) // both share 'a'
    })
  })

  it('selects a link by its curve and deletes only the link (items stay)', async () => {
    const stage = await renderWith([sticky('a', 100, 100), sticky('b', 400, 100)])
    // Drag near a's right edge (180,130) → b's left edge (400,130): a horizontal
    // string whose apex sags to ~(290,174).
    drawLink(stage, [178, 130], [402, 130])
    await waitFor(() => expect(stage.querySelector('[data-testid^="canvas-link-"]')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 290, clientY: 172, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 290, clientY: 172, pointerId: 1 })
    expect(await screen.findByRole('button', { name: 'Unlink' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Delete' })
    await waitFor(() => expect(stage.querySelector('[data-testid^="canvas-link-"]')).toBeNull())
    // Both items survive.
    expect(screen.getByTestId('canvas-item-a')).toBeTruthy()
    expect(screen.getByTestId('canvas-item-b')).toBeTruthy()
  })

  it('deleting an item removes its attached links (no dangling strings)', async () => {
    const stage = await renderWith([sticky('a', 100, 100), sticky('b', 400, 100)])
    drawLink(stage, [140, 130], [440, 130])
    await waitFor(() => expect(stage.querySelector('[data-testid^="canvas-link-"]')).toBeTruthy())

    // Select item 'a' and delete it.
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 140, clientY: 130, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 140, clientY: 130, pointerId: 1 })
    fireEvent.keyDown(document, { key: 'Delete' })

    await waitFor(() => expect(screen.queryByTestId('canvas-item-a')).toBeNull())
    expect(stage.querySelector('[data-testid^="canvas-link-"]')).toBeNull()
  })

  it('re-binds a link endpoint by dragging its anchor dot onto another item', async () => {
    const stage = await renderWith([sticky('a', 100, 100), sticky('b', 400, 100), sticky('c', 400, 400)])
    drawLink(stage, [178, 130], [402, 130]) // a(right) → b(left)
    await waitFor(() => expect(stage.querySelector('[data-testid^="canvas-link-"]')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 290, clientY: 172, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 290, clientY: 172, pointerId: 1 })

    // Drag the 'to' anchor from over b (~400,130) onto c (~440,430).
    const toDot = await screen.findByRole('button', { name: 'Re-bind link end' })
    fireEvent.pointerDown(toDot, { button: 0, clientX: 400, clientY: 130, pointerId: 1 })
    fireEvent.pointerMove(document, { clientX: 440, clientY: 430, pointerId: 1 })
    fireEvent.pointerUp(document, { clientX: 440, clientY: 430, pointerId: 1 })

    await waitFor(async () => {
      const link = (await repository.getWorld('ninth-vale'))?.canvas?.links[0]
      expect(link?.toId).toBe('c')
    })
  })

  it('adds a link node via the project dialog (not a native prompt)', async () => {
    await renderWith([])
    // No native window.prompt is used.
    const promptSpy = vi.spyOn(window, 'prompt')
    fireEvent.click(screen.getByRole('button', { name: 'Link node' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a link' })
    expect(promptSpy).not.toHaveBeenCalled()

    const add = within(dialog).getByRole('button', { name: 'Add link' })
    expect((add as HTMLButtonElement).disabled).toBe(true) // disabled until a valid URL
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Link URL' }), { target: { value: 'https://are.na/x' } })
    expect((add as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(add)

    await waitFor(() => expect(screen.getByTestId('reference-canvas-stage').querySelector('[data-kind="link"]')).toBeTruthy())
    expect(screen.queryByRole('dialog', { name: 'Add a link' })).toBeNull() // closed after add
  })

  it('marquee and Cmd+A select links too, and Delete removes items and links together', async () => {
    const stage = await renderWith([sticky('a', 100, 100), sticky('b', 400, 100)])
    drawLink(stage, [178, 130], [402, 130]) // a → b
    await waitFor(() => expect(stage.querySelector('[data-testid^="canvas-link-"]')).toBeTruthy())

    // Cmd+A selects both items and the link; every selected item shows the
    // data-selected indicator, and the link path carries its selected class.
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.keyDown(document, { key: 'a', metaKey: true })
    expect(stage.querySelectorAll('[data-kind][data-selected="true"]').length).toBe(2)
    expect(stage.querySelector('[data-testid^="canvas-link-"]')?.getAttribute('class')).toMatch(/linkSelected/)
    fireEvent.keyDown(document, { key: 'Delete' })
    await waitFor(() => {
      expect(stage.querySelector('[data-testid^="canvas-link-"]')).toBeNull()
      expect(screen.queryByTestId('canvas-item-a')).toBeNull()
      expect(screen.queryByTestId('canvas-item-b')).toBeNull()
    })
  })

  it('draws the arrowhead at the centre of the string when toggled on', async () => {
    const stage = await renderWith([sticky('a', 100, 100), sticky('b', 400, 100)])
    drawLink(stage, [178, 130], [402, 130])
    await waitFor(() => expect(stage.querySelector('[data-testid^="canvas-link-"]')).toBeTruthy())
    // Select the string, toggle its arrowhead.
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 290, clientY: 172, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 290, clientY: 172, pointerId: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Toggle arrowhead' }))

    // The ">>>" chevron path is the only link-layer path carrying a transform;
    // it sits near the string's mid-x (~290), not at an end, with three chevrons.
    const arrow = stage.querySelector('svg path[transform]') as SVGPathElement | null
    expect(arrow).toBeTruthy()
    expect((arrow!.getAttribute('d') ?? '').match(/M/g)?.length).toBe(3) // three chevrons
    const x = Number((arrow!.getAttribute('transform') ?? '').match(/translate\((-?[\d.]+)/)?.[1])
    expect(x).toBeGreaterThan(230)
    expect(x).toBeLessThan(350) // mid-span, not at the ~180 or ~400 ends
  })

  it('does not show connection nubs on the selected item (no collision with its resize handles)', async () => {
    const stage = await renderWith([sticky('a', 100, 100), sticky('b', 400, 100)])
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    // Select 'a' (its resize handles appear) then hover it.
    fireEvent.pointerDown(stage, { button: 0, clientX: 140, clientY: 130, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 140, clientY: 130, pointerId: 1 })
    fireEvent.pointerMove(stage, { clientX: 140, clientY: 130, pointerId: 1 })

    // Resize handles present, connection nubs suppressed on the selected item.
    expect(screen.getByRole('button', { name: 'Resize sticky item e' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Connect from/ })).toBeNull()

    // Hovering the OTHER (unselected) item still offers nubs.
    fireEvent.pointerMove(stage, { clientX: 440, clientY: 130, pointerId: 1 })
    expect(screen.getAllByRole('button', { name: /^Connect from/ }).length).toBeGreaterThan(0)
  })
})
