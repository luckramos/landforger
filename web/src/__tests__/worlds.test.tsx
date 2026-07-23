import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../routes'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { setRepository } from '../state/repository'
import { useSessionStore } from '../state/sessionStore'
import { createInMemoryStorage } from './testStorage'

let storage: Storage

function renderWorlds() {
  return render(
    <MemoryRouter initialEntries={['/worlds']}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  storage = createInMemoryStorage()
  setRepository(new LocalStorageWorldRepository(storage, fixtureFiles))
  useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
})

afterEach(() => {
  setRepository(undefined)
  vi.useRealTimers()
})

describe('Worlds screen', () => {
  it('greets the signed-in user and renders the fixture worlds from the repository', async () => {
    renderWorlds()
    expect(screen.getByRole('heading', { name: 'Welcome back, Sera.' })).toBeTruthy()

    expect(await screen.findByText('The Ninth Vale')).toBeTruthy()
    expect(screen.getByText('Marrowmoor')).toBeTruthy()
    expect(screen.getByText('Aeon Drift')).toBeTruthy()
    // Entry counts come from repository.listPages (The Ninth Vale ships 26 pages).
    expect(await screen.findByText('26 entries')).toBeTruthy()
  })

  it('spotlight search filters worlds by name and logline, scoped to worlds only', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale')

    // The header search is now a trigger that opens the Worlds spotlight modal
    // (parity with the Dashboard topbar), fuzzy-searching Worlds alone.
    fireEvent.click(screen.getByRole('button', { name: /Search worlds/ }))
    const search = screen.getByRole('combobox', { name: 'Search worlds by name or premise' })

    fireEvent.change(search, { target: { value: 'marrow' } })
    expect(screen.getByRole('option', { name: 'Marrowmoor, World' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'The Ninth Vale, World' })).toBeNull()

    // Logline match: "generation ark" belongs to Aeon Drift.
    fireEvent.change(search, { target: { value: 'generation ark' } })
    expect(screen.getByRole('option', { name: 'Aeon Drift, World' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Marrowmoor, World' })).toBeNull()

    fireEvent.change(search, { target: { value: 'no such world' } })
    expect(screen.getByText(/No worlds match/)).toBeTruthy()
  })

  it('selecting a spotlight result navigates into that world', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale')

    fireEvent.click(screen.getByRole('button', { name: /Search worlds/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Search worlds by name or premise' }), { target: { value: 'marrow' } })
    fireEvent.click(screen.getByRole('option', { name: 'Marrowmoor, World' }))

    expect(await screen.findByRole('heading', { name: 'Marrowmoor' })).toBeTruthy()
  })

  it('create modal enables Create only once the world is named', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale')

    fireEvent.click(screen.getByRole('button', { name: /Forge a new world/ }))
    const dialog = screen.getByRole('dialog', { name: 'Forge a new world' })
    const createButton = within(dialog).getByRole('button', { name: 'Create world' })
    expect((createButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gloamreach' } })
    expect((createButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: '   ' } })
    expect((createButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('creating a world persists it via the repository and navigates into it', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale')

    fireEvent.click(screen.getByRole('button', { name: /Forge a new world/ }))
    const dialog = screen.getByRole('dialog', { name: 'Forge a new world' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gloamreach' } })
    fireEvent.change(within(dialog).getByLabelText('Premise'), {
      target: { value: 'A city that only exists at dusk.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Science Fiction' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Starter structure/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create world' }))

    // Navigated into the new World's real Dashboard.
    expect(await screen.findByRole('heading', { name: 'Gloamreach' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Gloamreach · LandForger home' })).toBeTruthy()

    // Persisted: a second repository over the same storage sees it.
    const again = new LocalStorageWorldRepository(storage, fixtureFiles)
    const created = (await again.listWorlds()).find((w) => w.slug === 'gloamreach')
    expect(created?.name).toBe('Gloamreach')
    expect(created?.genre).toBe('Science Fiction')
    expect(created?.logline).toBe('A city that only exists at dusk.')
    expect(created?.categoryTemplates.length).toBe(7) // Starter structure seeds the default templates
  })

  it('Blank cosmos creates an empty world with no category templates', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale')

    fireEvent.click(screen.getByRole('button', { name: /Forge a new world/ }))
    const dialog = screen.getByRole('dialog', { name: 'Forge a new world' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Hollow Sea' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Blank cosmos/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create world' }))
    await screen.findByRole('heading', { name: 'Hollow Sea' })

    const again = new LocalStorageWorldRepository(storage, fixtureFiles)
    const created = (await again.listWorlds()).find((w) => w.slug === 'hollow-sea')
    expect(created?.categoryTemplates).toEqual([])
    expect(created?.eraOrder).toEqual([])
    expect(await again.listPages('hollow-sea')).toEqual([])
  })

  // The burst disc and its 640ms envelope are gone — selecting a World is now a
  // View Transition, so the dashboard route swaps in with no interstitial.
  it('clicking a world card navigates straight to its dashboard route', async () => {
    renderWorlds()
    const card = (await screen.findByText('Marrowmoor')).closest('button')!
    fireEvent.click(card)

    expect(screen.queryByRole('status', { name: /^Opening/ })).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Marrowmoor' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Marrowmoor · LandForger home' })).toBeTruthy()
  })

  it('keyboard activation (native button click) navigates the same as a pointer click', async () => {
    renderWorlds()
    const card = (await screen.findByText('Aeon Drift')).closest('button')!
    // A focused <button>'s Enter/Space activation fires a native `click`
    // event, exercised the same way as a pointer click here.
    card.focus()
    fireEvent.click(card)

    expect(await screen.findByRole('heading', { name: 'Aeon Drift' })).toBeTruthy()
  })
})
