import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { createInMemoryStorage } from './testStorage'

let repo: LocalStorageWorldRepository

async function renderAt(path: string) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await act(async () => {})
  return result
}

beforeEach(() => {
  repo = new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles)
  setRepository(repo)
})

afterEach(() => {
  setRepository(undefined)
  vi.useRealTimers()
})

describe('Dashboard routes', () => {
  it('renders the World home from repository data with live Category counts and recently edited Pages', async () => {
    await repo.updatePage('ninth-vale', 'sera', { summary: 'Most recently touched.' })
    const { container } = await renderAt('/w/ninth-vale')

    expect(screen.getByRole('heading', { name: 'The Ninth Vale' })).toBeTruthy()
    expect(screen.getByText(/began as one guild cartographer's private obsession/)).toBeTruthy()
    const categories = within(screen.getByLabelText('Categories'))
    expect(categories.getByRole('link', { name: /Characters 3/ })).toBeTruthy()
    expect(categories.getByRole('link', { name: /Locations 11/ })).toBeTruthy()
    expect(within(screen.getByLabelText('Recently edited')).getAllByRole('link')[0].textContent).toContain('Sera Valen')
    expect(container.querySelector('[data-route-key="/w/ninth-vale"]')).toBeTruthy()
  })

  it('renders Category and Tag list routes from repository Pages', async () => {
    const category = await renderAt('/w/ninth-vale/c/characters')
    expect(screen.getByRole('heading', { name: 'Characters' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Sera Valen/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Duskwater/ })).toBeNull()
    category.unmount()

    await renderAt('/w/ninth-vale/t/coastal')
    expect(screen.getByRole('heading', { name: '#coastal' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Sera Valen/ })).toBeTruthy()
  })
})

describe('Dashboard shell controls', () => {
  it('collapses the Sidebar and enters/exits focus mode with Escape', async () => {
    await renderAt('/w/ninth-vale')
    const shell = screen.getByTestId('dashboard-shell')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(shell.getAttribute('data-sidebar')).toBe('collapsed')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))
    expect(shell.getAttribute('data-focus')).toBe('true')
    expect(screen.getByRole('button', { name: 'Exit focus mode' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(shell.getAttribute('data-focus')).toBe('false')
  })

  it('toggles the Page editor read-only and hides its format toolbar', async () => {
    await renderAt('/w/ninth-vale/p/sera')
    expect(within(screen.getByLabelText('Breadcrumb')).getByText('Sera Valen')).toBeTruthy()
    expect(await screen.findByRole('toolbar', { name: 'Format' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enable read-only' }))
    expect(screen.queryByRole('toolbar', { name: 'Format' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Disable read-only' })).toBeTruthy()
  })

  it('opens the World search from the documented keyboard shortcut', async () => {
    await renderAt('/w/ninth-vale')
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Search the World' })).toBeTruthy()
    expect(screen.getByText(/Spotlight search arrives/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Search the World' })).toBeNull()
  })

  it('pulses Saving then Saved when any repository mutation occurs', async () => {
    vi.useFakeTimers()
    await renderAt('/w/ninth-vale')
    expect(screen.getByTestId('save-indicator').textContent).toBe('Saved')

    await act(async () => {
      await repo.updatePage('ninth-vale', 'sera', { summary: 'A mutation from anywhere.' })
    })
    expect(screen.getByTestId('save-indicator').textContent).toBe('Saving')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400)
    })
    expect(screen.getByTestId('save-indicator').textContent).toBe('Saved')
  })
})
