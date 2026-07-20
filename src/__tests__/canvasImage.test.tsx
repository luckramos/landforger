import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryAssetStore } from '../canvas/assets/MemoryAssetStore'
import type { CanvasImageItem } from '../canvas/types'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setAssetStore } from '../state/assetStore'
import { setRepository } from '../state/repository'
import { resetDockStore, setDockStorage } from '../state/dockStore'
import { createInMemoryStorage } from './testStorage'

let repository: LocalStorageWorldRepository
let storage: Storage

function imageItem(overrides: Partial<CanvasImageItem> & Pick<CanvasImageItem, 'id' | 'source'>): CanvasImageItem {
  return { kind: 'image', x: 120, y: 120, width: 240, height: 180, rotation: 0, color: '#000000', caption: '', ...overrides }
}

async function renderCanvasWith(items: CanvasImageItem[]) {
  await repository.updateWorld('ninth-vale', { canvas: { items, links: [] } })
  render(
    <MemoryRouter initialEntries={['/w/ninth-vale?panel=canvas']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await act(async () => {})
}

beforeEach(() => {
  storage = createInMemoryStorage()
  repository = new LocalStorageWorldRepository(storage, fixtureFiles)
  setRepository(repository)
  setAssetStore(new MemoryAssetStore())
  setDockStorage(createInMemoryStorage())
  resetDockStore()
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => `blob:mock/${(blob as Blob).size}`)
})

afterEach(() => {
  setRepository(undefined)
  setAssetStore(undefined)
  setDockStorage(null)
  vi.restoreAllMocks()
})

describe('Reference canvas — image node', () => {
  it('renders a URL-backed image and opens a lightbox on double-click', async () => {
    await renderCanvasWith([imageItem({ id: 'canvas-img-url', source: { type: 'url', href: 'https://example.com/ref.jpg' } })])

    const node = screen.getByTestId('canvas-item-canvas-img-url')
    const img = within(node).getByRole('img') as HTMLImageElement
    expect(img.src).toBe('https://example.com/ref.jpg')

    fireEvent.doubleClick(node)
    const lightbox = await screen.findByRole('dialog', { name: 'Image preview' })
    expect(within(lightbox).getByRole('img')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull()
  })

  it('shows "File unavailable" + Re-attach when the backing asset is missing (node not lost)', async () => {
    await renderCanvasWith([imageItem({ id: 'canvas-img-gone', source: { type: 'asset', assetId: 'asset-missing', filename: 'lost.png', mime: 'image/png', size: 10 } })])

    // Node still exists…
    expect(screen.getByTestId('canvas-item-canvas-img-gone')).toBeTruthy()
    // …and once resolution completes, degrades to the actionable card.
    expect(await screen.findByText('File unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Re-attach' })).toBeTruthy()
    expect(screen.getByText('lost.png')).toBeTruthy()
  })

  it('resolves an uploaded asset to a bitmap URL', async () => {
    // Store bytes in the injected AssetStore, then reference them from a node —
    // the panel resolves the asset id to an object URL for the <img>.
    const store = new MemoryAssetStore()
    setAssetStore(store)
    const stored = await store.putAsset(new Blob(['bytes'], { type: 'image/png' }))
    await renderCanvasWith([imageItem({ id: 'canvas-img-asset', source: { type: 'asset', assetId: stored.id, filename: 'ok.png', mime: 'image/png', size: 5 } })])

    await waitFor(() => {
      const node = screen.getByTestId('canvas-item-canvas-img-asset')
      const img = within(node).queryByRole('img') as HTMLImageElement | null
      expect(img?.src).toMatch(/^blob:mock\//)
    })
  })

  it('falls back to "File unavailable" when a bitmap fails to decode/load', async () => {
    await renderCanvasWith([imageItem({ id: 'canvas-img-broken', source: { type: 'url', href: 'https://example.com/broken.jpg' } })])
    const node = screen.getByTestId('canvas-item-canvas-img-broken')
    fireEvent.error(within(node).getByRole('img'))
    expect(await within(node).findByText('File unavailable')).toBeTruthy()
    expect(within(node).getByRole('button', { name: 'Re-attach' })).toBeTruthy()
  })

  it('shows the empty-board invitation when the canvas has no items', async () => {
    await renderCanvasWith([])
    expect(await screen.findByText(/Drop images, PDFs, links, or notes/)).toBeTruthy()
  })

  it('exposes an enabled Image tool in the toolbar', async () => {
    await renderCanvasWith([])
    const toolbar = await screen.findByRole('toolbar', { name: 'Canvas tools' })
    expect((within(toolbar).getByRole('button', { name: 'Image' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
