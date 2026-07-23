import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { resetDockStore, setDockStorage } from '../state/dockStore'
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
  setDockStorage(createInMemoryStorage())
  resetDockStore()
})

afterEach(() => {
  setRepository(undefined)
  setDockStorage(null)
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

describe('Dashboard — Category Template editing', () => {
  it('opens the template editor from the Category page pencil and seeds future Pages', async () => {
    const view = await renderAt('/w/ninth-vale/c/characters')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Characters template' }))
    const dialog = screen.getByRole('dialog', { name: 'Characters template' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add property' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add number to template' }))
    fireEvent.change(within(dialog).getByLabelText('Template property name for numberProperty'), { target: { value: 'Renown' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' }))
    await act(async () => {})

    const future = await repo.createPage('ninth-vale', { title: 'New Face', category: 'characters' })
    expect(future.customProperties).toContainEqual(
      expect.objectContaining({ key: 'numberProperty', label: 'Renown', type: 'number', value: 0 }),
    )
    view.unmount()
  })

  it('shows the template pencil on Category pages but not Tag collections', async () => {
    const category = await renderAt('/w/ninth-vale/c/characters')
    expect(screen.getByRole('button', { name: 'Edit Characters template' })).toBeTruthy()
    category.unmount()

    await renderAt('/w/ninth-vale/t/coastal')
    expect(screen.queryByRole('button', { name: /template$/ })).toBeNull()
  })
})

describe('Dashboard shell controls', () => {
  it('collapses the Sidebar and enters/exits focus mode with Escape', async () => {
    // Focus mode is a Page-scoped control, so open a Page to reach it.
    await renderAt('/w/ninth-vale/p/sera')
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

  it('carries the full text of truncated Breadcrumb segments in a title attribute', async () => {
    await renderAt('/w/ninth-vale/p/sera')
    const breadcrumb = screen.getByLabelText('Breadcrumb')

    const worldSegment = within(breadcrumb).getByRole('link', { name: 'The Ninth Vale' })
    expect(worldSegment.textContent).toBe('The Ninth Vale')
    expect(worldSegment.getAttribute('title')).toBe('The Ninth Vale')

    const pageSegment = within(breadcrumb).getByText('Sera Valen')
    expect(pageSegment.getAttribute('title')).toBe('Sera Valen')
  })

  it('opens Spotlight from the shortcut or topbar trigger and focuses its search box', async () => {
    await renderAt('/w/ninth-vale')
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Search the World' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Search Pages and Categories' })).toBe(document.activeElement)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search the World' })).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /Search the world/ }))
    expect(screen.getByRole('dialog', { name: 'Search the World' })).toBeTruthy()
  })

  it('fuzzy-searches Pages and Categories and highlights the matched title characters', async () => {
    await renderAt('/w/ninth-vale/p/sera')
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const search = screen.getByRole('combobox', { name: 'Search Pages and Categories' })

    fireEvent.change(search, { target: { value: 'sra' } })
    const sera = screen.getByRole('option', { name: /Sera Valen.*Characters/ })
    expect([...sera.querySelectorAll('mark')].map((mark) => mark.textContent).join('')).toBe('Sra')

    fireEvent.change(search, { target: { value: 'char' } })
    expect(screen.getByRole('option', { name: /Characters.*Category/ })).toBeTruthy()
  })

  it('carries the full text of truncated Spotlight result copy in a title attribute', async () => {
    await renderAt('/w/ninth-vale')
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const search = screen.getByRole('combobox', { name: 'Search Pages and Categories' })

    fireEvent.change(search, { target: { value: 'sera' } })
    const sera = screen.getByRole('option', { name: /Sera Valen.*Characters/ })
    const summary = "A guild cartographer chasing the ninth map before the tide swallows what's left of the coast."
    expect(sera.querySelector('strong')?.getAttribute('title')).toBe('Sera Valen')
    expect(sera.querySelector('small')?.getAttribute('title')).toBe(summary)

    fireEvent.change(search, { target: { value: 'char' } })
    const characters = screen.getByRole('option', { name: /Characters.*Category/ })
    expect(characters.querySelector('strong')?.getAttribute('title')).toBe('Characters')
    expect(characters.querySelector('small')?.getAttribute('title')).toBe('Category')
  })

  it('moves the Spotlight selection with arrows and Enter navigates to the selected Page', async () => {
    await renderAt('/w/ninth-vale')
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const search = screen.getByRole('combobox', { name: 'Search Pages and Categories' })
    fireEvent.change(search, { target: { value: 'salt' } })

    let options = screen.getAllByRole('option')
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    expect(options[0].getAttribute('aria-label')).toMatch(/Salt & Cinder/)

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    options = screen.getAllByRole('option')
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(options[1].getAttribute('aria-label')).toMatch(/The Salt & Cinder Days/)

    fireEvent.keyDown(search, { key: 'ArrowUp' })
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(search, { key: 'ArrowUp' })
    options = screen.getAllByRole('option')
    expect(options.at(-1)?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(await screen.findByRole('heading', { name: 'The Salt & Cinder Days' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search the World' })).toBeNull())
  })

  it('opens a Category result through the real Category route', async () => {
    await renderAt('/w/ninth-vale/p/sera')
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const search = screen.getByRole('combobox', { name: 'Search Pages and Categories' })
    fireEvent.change(search, { target: { value: 'characters' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Sera Valen/ })).toBeTruthy()
  })

  it('updates open Spotlight results when the World repository changes', async () => {
    await renderAt('/w/ninth-vale')
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const search = screen.getByRole('combobox', { name: 'Search Pages and Categories' })
    fireEvent.change(search, { target: { value: 'northstar' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)

    await act(async () => {
      await repo.createPage('ninth-vale', {
        title: 'The Northstar Archive',
        category: 'stories',
        summary: 'Freshly charted while Spotlight is open.',
      })
    })

    expect(await screen.findByRole('option', { name: /The Northstar Archive.*Stories/ })).toBeTruthy()

    await act(async () => {
      await repo.deletePage('ninth-vale', 'the-northstar-archive')
    })
    await waitFor(() => expect(screen.queryByRole('option', { name: /The Northstar Archive/ })).toBeNull())
  })

  it('pulses Saving then Saved when any repository mutation occurs', async () => {
    vi.useFakeTimers()
    // The topbar save indicator is a Page-scoped control; open a Page to see it.
    await renderAt('/w/ninth-vale/p/sera')
    // Let the editor's mount-time normalization save settle so the indicator
    // starts from a quiet "Saved" baseline.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
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
