import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryAssetStore } from '../canvas/assets/MemoryAssetStore'
import type { CanvasItem } from '../canvas/types'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setAssetStore } from '../state/assetStore'
import { setRepository } from '../state/repository'
import { resetDockStore, setDockStorage } from '../state/dockStore'
import { createInMemoryStorage } from './testStorage'

let repository: LocalStorageWorldRepository
let storage: Storage
let assets: MemoryAssetStore

async function renderCanvasWith(items: CanvasItem[]) {
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
  assets = new MemoryAssetStore()
  setAssetStore(assets)
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

describe('Reference canvas — link / pdf / markdown nodes', () => {
  it('creates a Link card from a pasted URL and opens it in a new tab on double-click', async () => {
    await renderCanvasWith([])
    const stage = screen.getByTestId('reference-canvas-stage')
    stage.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}) }) as DOMRect

    // Paste a URL → a link node appears with the domain as its meta.
    fireEvent.paste(document, { clipboardData: { files: [], getData: () => 'https://www.are.na/channel/refs' } })
    const node = await within(stage).findByText('are.na', { exact: false })
    const card = node.closest('[data-kind="link"]') as HTMLElement
    expect(card).toBeTruthy()

    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    fireEvent.doubleClick(card)
    expect(open).toHaveBeenCalledWith('https://www.are.na/channel/refs', '_blank', expect.stringContaining('noopener'))
  })

  it('renders a PDF card with filename + size and opens it in a new tab', async () => {
    const stored = await assets.putAsset(new Blob(['%PDF-1.4 bytes'], { type: 'application/pdf' }))
    await renderCanvasWith([
      { id: 'canvas-pdf', kind: 'pdf', x: 120, y: 120, width: 260, height: 96, rotation: 0, color: '#000000', title: 'Tide charts', source: { type: 'asset', assetId: stored.id, filename: 'charts.pdf', mime: 'application/pdf', size: 2048 } },
    ])

    const card = screen.getByTestId('canvas-item-canvas-pdf')
    expect(within(card).getByText(/charts\.pdf/)).toBeTruthy()
    expect(within(card).getByText(/2 KB/)).toBeTruthy()

    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await waitFor(() => expect(open).not.toHaveBeenCalled()) // url resolves first
    fireEvent.doubleClick(card)
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringMatching(/^blob:mock\//), '_blank', expect.stringContaining('noopener')))
  })

  it('renders a Markdown card preview and opens the in-app reader overlay', async () => {
    const stored = await assets.putAsset(new Blob(['# Saltcinder\n\nThe **Order** burns maps.'], { type: 'text/markdown' }))
    await renderCanvasWith([
      { id: 'canvas-md', kind: 'md', x: 120, y: 120, width: 280, height: 220, rotation: 0, color: '#000000', title: 'Lore', source: { type: 'asset', assetId: stored.id, filename: 'lore.md', mime: 'text/markdown', size: 40 } },
    ])

    const card = screen.getByTestId('canvas-item-canvas-md')
    // The tiptap-rendered preview shows the heading text.
    expect(await within(card).findByText('Saltcinder')).toBeTruthy()

    fireEvent.doubleClick(card)
    const reader = await screen.findByRole('dialog', { name: 'Markdown reader' })
    expect(within(reader).getByText('Saltcinder')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close reader' }))
    expect(screen.queryByRole('dialog', { name: 'Markdown reader' })).toBeNull()
  })

  it('creates PDF and Markdown nodes from picked files (mime-routed), and a Link from the toolbar tool', async () => {
    await renderCanvasWith([])
    const stage = screen.getByTestId('reference-canvas-stage')
    stage.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}) }) as DOMRect
    const input = screen.getByTestId('canvas-file-input') as HTMLInputElement

    // Picking a PDF + an MD file routes each to the right node kind.
    const pdf = new File(['%PDF'], 'chart.pdf', { type: 'application/pdf' })
    const md = new File(['# Note'], 'lore.md', { type: 'text/markdown' })
    Object.defineProperty(input, 'files', { value: [pdf, md], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(stage.querySelector('[data-kind="pdf"]')).toBeTruthy())
    expect(stage.querySelector('[data-kind="md"]')).toBeTruthy()

    // The toolbar Link tool prompts for a URL and drops a link card.
    vi.spyOn(window, 'prompt').mockReturnValue('https://example.com/ref')
    fireEvent.click(screen.getByRole('button', { name: 'Link node' }))
    await waitFor(() => expect(stage.querySelector('[data-kind="link"]')).toBeTruthy())
  })

  it('falls back to a glyph when the favicon fails to load', async () => {
    await renderCanvasWith([
      { id: 'canvas-link', kind: 'link', x: 120, y: 120, width: 260, height: 76, rotation: 0, color: '#000000', title: 'ref', source: { type: 'url', href: 'https://www.are.na/x' } },
    ])
    const card = screen.getByTestId('canvas-item-canvas-link')
    const favicon = card.querySelector('img') as HTMLImageElement
    expect(favicon).toBeTruthy()
    fireEvent.error(favicon)
    // The <img> is replaced by the glyph (no img left in the favicon slot); domain still shown.
    expect(card.querySelector('img')).toBeNull()
    expect(within(card).getByText('are.na')).toBeTruthy()
  })

  it('shows "File unavailable" + Re-attach for a PDF/MD whose asset is missing', async () => {
    await renderCanvasWith([
      { id: 'canvas-md-gone', kind: 'md', x: 120, y: 120, width: 280, height: 220, rotation: 0, color: '#000000', title: 'Lost', source: { type: 'asset', assetId: 'asset-missing', filename: 'lost.md', mime: 'text/markdown', size: 10 } },
    ])
    const card = screen.getByTestId('canvas-item-canvas-md-gone')
    expect(await within(card).findByText('File unavailable')).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Re-attach' })).toBeTruthy()
  })

  it('link title is inline-editable and persists without touching the source URL', async () => {
    await renderCanvasWith([
      { id: 'canvas-link', kind: 'link', x: 120, y: 120, width: 260, height: 76, rotation: 0, color: '#000000', title: 'are.na', source: { type: 'url', href: 'https://www.are.na/x' } },
    ])
    const card = screen.getByTestId('canvas-item-canvas-link')
    const title = within(card).getByRole('textbox', { name: 'Node title' })
    fireEvent.change(title, { target: { value: 'Cartography refs' } })
    fireEvent.blur(title)

    await waitFor(async () => {
      const saved = await repository.getWorld('ninth-vale')
      const link = saved?.canvas?.items.find((item) => item.id === 'canvas-link')
      expect(link?.kind === 'link' && link.title).toBe('Cartography refs')
      expect(link?.kind === 'link' && link.source.href).toBe('https://www.are.na/x') // source untouched
    })
  })
})
