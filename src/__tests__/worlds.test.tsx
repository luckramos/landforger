import { fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
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

  it('search filters by name and logline, live', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale')

    const search = screen.getByLabelText('Search worlds')
    fireEvent.change(search, { target: { value: 'marrow' } })
    expect(screen.getByText('Marrowmoor')).toBeTruthy()
    expect(screen.queryByText('The Ninth Vale')).toBeNull()

    // Logline match: "generation ark" belongs to Aeon Drift.
    fireEvent.change(search, { target: { value: 'generation ark' } })
    expect(screen.getByText('Aeon Drift')).toBeTruthy()
    expect(screen.queryByText('Marrowmoor')).toBeNull()

    fireEvent.change(search, { target: { value: 'no such world' } })
    expect(screen.getByText(/No worlds match/)).toBeTruthy()

    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByText('The Ninth Vale')).toBeTruthy()
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
    expect(screen.getByRole('link', { name: 'Gloamreach home' })).toBeTruthy()

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

  it('clicking a world card plays a burst in the World color anchored at the card, then navigates to its dashboard route', async () => {
    renderWorlds()
    const card = (await screen.findByText('Marrowmoor')).closest('button')!
    vi.useFakeTimers()
    fireEvent.click(card)

    // Burst overlay is up, colored by the World, anchored at the card — no hard cut yet.
    const overlay = screen.getByRole('status', { name: 'Opening Marrowmoor' })
    expect(overlay.getAttribute('style')).toContain('oklch(0.68 0.1 350)')
    expect(screen.queryByRole('link', { name: 'Marrowmoor home' })).toBeNull()

    act(() => {
      vi.advanceTimersByTime(639)
    })
    expect(screen.queryByRole('link', { name: 'Marrowmoor home' })).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    vi.useRealTimers()
    expect(await screen.findByRole('heading', { name: 'Marrowmoor' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Marrowmoor home' })).toBeTruthy()
  })

  it('keyboard activation (native button click) plays the same burst as a pointer click', async () => {
    renderWorlds()
    const card = (await screen.findByText('Aeon Drift')).closest('button')!
    vi.useFakeTimers()
    // A focused <button>'s Enter/Space activation fires a native `click`
    // event, exercised the same way as a pointer click here.
    card.focus()
    fireEvent.click(card)

    expect(screen.getByRole('status', { name: 'Opening Aeon Drift' })).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(640)
    })
    vi.useRealTimers()
    expect(await screen.findByRole('heading', { name: 'Aeon Drift' })).toBeTruthy()
  })
})
