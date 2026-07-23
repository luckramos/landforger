import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageWorldRepository } from '../../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../../repository/fixtures'
import { AppRoutes } from '../../routes'
import { setRepository } from '../../state/repository'
import { createInMemoryStorage } from '../../__tests__/testStorage'

let repository: LocalStorageWorldRepository

async function renderLibrary() {
  render(
    <MemoryRouter initialEntries={['/w/ninth-vale/library']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await act(async () => {})
}

beforeEach(() => {
  repository = new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles)
  setRepository(repository)
})

afterEach(() => setRepository(undefined))

describe('Map Library', () => {
  // The fixture files a map into a folder, so `openSheet` first walks the
  // breadcrumb/drawers to wherever the chart lives before opening its gear.
  const openSheet = (mapTitle: string) => {
    fireEvent.click(screen.getByRole('button', { name: `${mapTitle} settings` }))
    return screen.getByRole('dialog', { name: `${mapTitle} settings` })
  }

  it('lists every Map at the Library root and renames one through the gear sheet', async () => {
    await renderLibrary()
    expect(await screen.findByRole('heading', { name: 'Map Library' })).toBeTruthy()
    // Root-level charts (the fixture files none in folders): all four plates plus no drawers.
    expect(screen.getAllByRole('article')).toHaveLength(4)
    const sheet = openSheet('The Drowned Coast')
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Map name' }), { target: { value: 'The Shifting Coast' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.maps[0].title).toBe('The Shifting Coast'))
  })

  it('makes a Library Map multi-chart and reveals its per-era upload rows, persisting live', async () => {
    await renderLibrary()
    await screen.findByRole('article', { name: 'The Ninth Vale' })
    const sheet = openSheet('The Ninth Vale')
    // A fixed-chart Map shows no per-era rows yet.
    expect(within(sheet).queryByLabelText(/^Chart for /)).toBeNull()

    // Switching to per-era persists immediately — no staged Save needed.
    fireEvent.click(within(sheet).getByRole('radio', { name: /Per era/ }))
    await waitFor(async () => {
      const map = (await repository.getWorld('ninth-vale'))!.maps.find((candidate) => candidate.id === 'ninth-vale')!
      expect(map.eraLinked).toBe(true)
    })
    expect(await within(sheet).findByLabelText('Chart for The Salt & Cinder Days')).toBeTruthy()
  })

  it('detaches a child Map from its Pin via the gear sheet unlink button', async () => {
    await renderLibrary()
    await screen.findByRole('article', { name: 'The Ninth Vale' })
    openSheet('The Ninth Vale')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pin link' }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.maps.find((map) => map.id === 'ninth-vale')).not.toHaveProperty('parentMap'))
  })

  it('links a Map to a location Pin through the fuzzy picker', async () => {
    await renderLibrary()
    const sheet = openSheet('The Ninth Vale')
    // The Ninth Vale already links to its own Pin, so its link button is labelled with that Page.
    fireEvent.click(within(sheet).getByRole('button', { name: 'The Ninth Vale' }))
    const picker = await screen.findByRole('dialog', { name: 'Link a location Pin' })
    fireEvent.change(within(picker).getByRole('searchbox', { name: 'Search location Pins' }), { target: { value: 'guild' } })
    fireEvent.click(await within(picker).findByRole('button', { name: /The Guild Hall/ }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.maps.find((map) => map.id === 'ninth-vale')?.parentPin).toBe('pin-guild-hall'))
  })

  it('confirms before replacing an existing Root Map, then re-roots', async () => {
    await renderLibrary()
    await screen.findByRole('article', { name: 'The Ninth Vale' })
    fireEvent.click(within(openSheet('The Ninth Vale')).getByRole('button', { name: 'Set as Root Map' }))
    // A Root Map already exists (The Drowned Coast), so a confirm dialog intervenes.
    const confirm = await screen.findByRole('dialog', { name: 'Change Root Map to The Ninth Vale' })
    expect(within(confirm).getByText('The Drowned Coast')).toBeTruthy()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Make it Root' }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.rootMap).toBe('ninth-vale'))
    expect((await repository.getWorld('ninth-vale'))!.pins.find((pin) => pin.id === 'pin-ninth-vale')).not.toHaveProperty('childMap')
  })

  it('deletes a Map, removes its Pins and returns direct children to the Library', async () => {
    await renderLibrary()
    await screen.findByRole('article', { name: 'The Drowned Coast' })
    fireEvent.click(within(openSheet('The Drowned Coast')).getByRole('button', { name: 'Delete Map' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm delete The Drowned Coast' }))

    await waitFor(async () => {
      const world = (await repository.getWorld('ninth-vale'))!
      expect(world.maps.some((map) => map.id === 'drowned-coast')).toBe(false)
      expect(world.pins.some((pin) => pin.mapId === 'drowned-coast')).toBe(false)
      expect(world.maps.find((map) => map.id === 'duskwater')).not.toHaveProperty('parentMap')
      expect(world.maps.find((map) => map.id === 'ninth-vale')).not.toHaveProperty('parentMap')
    })
  })

  it('fuzzy-searches the Library through the spotlight', async () => {
    await renderLibrary()
    await screen.findByRole('heading', { name: 'Map Library' })
    fireEvent.click(screen.getByRole('button', { name: /Search the library/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Search the Library' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Search maps and folders' }), { target: { value: 'dusk' } })
    expect(within(dialog).getByRole('option', { name: /Duskwater, map/ })).toBeTruthy()
    // A non-matching query is filtered out by the fuzzy matcher.
    expect(within(dialog).queryByRole('option', { name: /Ashthorn Keep/ })).toBeNull()
  })

  it('creates a folder and files a chart into it via the gear sheet', async () => {
    await renderLibrary()
    await screen.findByRole('heading', { name: 'Map Library' })
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New folder name' }), { target: { value: 'Coastal charts' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New folder name' }), { key: 'Enter' })
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.mapFolders).toHaveLength(1))

    const sheet = openSheet('The Drowned Coast')
    fireEvent.change(within(sheet).getByRole('combobox', { name: 'Folder' }), { target: { value: 'coastal-charts' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.maps.find((map) => map.id === 'drowned-coast')?.folder).toBe('coastal-charts'))
  })

  // Issue #61: each card carries its list index as a CSS custom property, so
  // MapLibrary.module.css's `animation-delay: calc(... * var(--card-index) * 60ms)`
  // cascades the gallery in — first card first, last card last.
  it('gives each card a distinct --card-index so the gallery cascades in', async () => {
    await renderLibrary()
    const cards = screen.getAllByRole('article')
    expect(cards.length).toBeGreaterThan(1)
    cards.forEach((card, index) => {
      expect(card.style.getPropertyValue('--card-index')).toBe(String(index))
    })
  })
})
