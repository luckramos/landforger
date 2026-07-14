import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { createInMemoryStorage } from './testStorage'

let repository: LocalStorageWorldRepository
let storage: Storage

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
  storage = createInMemoryStorage()
  repository = new LocalStorageWorldRepository(storage, fixtureFiles)
  setRepository(repository)
})

afterEach(() => setRepository(undefined))

describe('Timeline panel', () => {
  it('is refresh-safe, excludes Timeless Pages and expands members grouped by Category', async () => {
    await renderAt('/w/ninth-vale?panel=timeline')
    const dialog = await screen.findByRole('dialog', { name: 'Timeline' })
    expect(within(dialog).getByText('4 Eras')).toBeTruthy()
    expect(within(dialog).getByText('Before the First Sounding')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Expand The Salt & Cinder Days' }))
    expect(within(dialog).getByRole('heading', { name: 'characters' })).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: 'locations' })).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'Sera Valen' })).toBeTruthy()
    expect(within(dialog).queryByText('The Ninth Vale')).toBeNull()
  })

  it('persists the Active Era for the World', async () => {
    await renderAt('/w/ninth-vale?panel=timeline')
    const dialog = await screen.findByRole('dialog', { name: 'Timeline' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make The Age of Charts the Active Era' }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))?.activeEra).toBe('era-charts'))
    expect(within(dialog).getByText('Active Era: The Age of Charts')).toBeTruthy()
  })

  it('lands on a focused Page occurrence, pulses it and cycles all occurrences', async () => {
    await renderAt('/w/ninth-vale/p/sera')
    fireEvent.click(await screen.findByRole('link', { name: 'See on timeline' }))
    const dialog = await screen.findByRole('dialog', { name: 'Timeline' })
    expect(within(dialog).getByText('1 / 2')).toBeTruthy()
    expect(within(dialog).getByTestId('timeline-era-era-charts').getAttribute('data-occurrence')).toBe('true')
    expect(within(dialog).getByTestId('timeline-era-era-saltcinder').getAttribute('data-occurrence')).toBe('true')
    await waitFor(() => expect(within(dialog).getByTestId('timeline-era-era-charts').getAttribute('data-pulse')).toBe('true'))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next occurrence' }))
    expect(within(dialog).getByText('2 / 2')).toBeTruthy()
    await waitFor(() => expect(within(dialog).getByTestId('timeline-era-era-saltcinder').getAttribute('data-pulse')).toBe('true'))
  })

  it('reorders only in Manage order mode and persists through reload', async () => {
    await renderAt('/w/ninth-vale?panel=timeline')
    const dialog = await screen.findByRole('dialog', { name: 'Timeline' })
    expect(within(dialog).queryByTestId('manage-era-era-founding')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Manage order' }))

    const first = within(dialog).getByTestId('manage-era-era-founding')
    const last = within(dialog).getByTestId('manage-era-era-saltcinder')
    fireEvent.dragStart(first)
    fireEvent.dragEnter(last)
    fireEvent.dragEnd(first)

    await waitFor(async () =>
      expect((await repository.getWorld('ninth-vale'))?.eraOrder).toEqual([
        'era-charts',
        'era-drowning',
        'era-saltcinder',
        'era-founding',
      ]),
    )
    const reloaded = new LocalStorageWorldRepository(storage, fixtureFiles)
    expect((await reloaded.getWorld('ninth-vale'))?.eraOrder.at(-1)).toBe('era-founding')
  })

  it('creates the first Era from an empty timeline', async () => {
    const world = await repository.createWorld({
      name: 'Empty Time',
      genre: 'Fantasy',
      color: '#aa8855',
      template: 'starter',
    })
    await renderAt(`/w/${world.slug}?panel=timeline`)
    const dialog = await screen.findByRole('dialog', { name: 'Timeline' })
    expect(within(dialog).getByText('No Eras yet')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create first Era' }))
    fireEvent.change(within(dialog).getByLabelText('Era title'), { target: { value: 'The First Light' } })
    fireEvent.change(within(dialog).getByLabelText('Date Label'), { target: { value: 'Before all reckonings' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Era' }))

    await waitFor(async () => expect((await repository.getWorld(world.slug))?.activeEra).toBe('the-first-light'))
    expect(within(dialog).getByText('The First Light')).toBeTruthy()
  })
})
