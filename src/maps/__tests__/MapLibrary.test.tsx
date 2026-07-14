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
  it('lists every Map and renames one through the repository seam', async () => {
    await renderLibrary()
    expect(await screen.findByRole('heading', { name: 'Map Library' })).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(4)
    const coast = screen.getByRole('article', { name: 'The Drowned Coast' })
    fireEvent.change(within(coast).getByRole('textbox', { name: 'Map name' }), { target: { value: 'The Shifting Coast' } })
    fireEvent.click(within(coast).getByRole('button', { name: 'Save name' }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.maps[0].title).toBe('The Shifting Coast'))
  })

  it('re-parents a Map to the Library and sets a child as the Root Map', async () => {
    await renderLibrary()
    const vale = await screen.findByRole('article', { name: 'The Ninth Vale' })
    fireEvent.change(within(vale).getByRole('combobox', { name: 'Parent placement' }), { target: { value: '' } })
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.maps.find((map) => map.id === 'ninth-vale')).not.toHaveProperty('parentMap'))

    fireEvent.click(within(vale).getByRole('button', { name: 'Set as Root Map' }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.rootMap).toBe('ninth-vale'))
    expect((await repository.getWorld('ninth-vale'))!.pins.find((pin) => pin.id === 'pin-ninth-vale')).not.toHaveProperty('childMap')
  })

  it('deletes a Map, removes its Pins and returns direct children to the Library', async () => {
    await renderLibrary()
    const coast = await screen.findByRole('article', { name: 'The Drowned Coast' })
    fireEvent.click(within(coast).getByRole('button', { name: 'Delete Map' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete The Drowned Coast' }))

    await waitFor(async () => {
      const world = (await repository.getWorld('ninth-vale'))!
      expect(world.maps.some((map) => map.id === 'drowned-coast')).toBe(false)
      expect(world.pins.some((pin) => pin.mapId === 'drowned-coast')).toBe(false)
      expect(world.maps.find((map) => map.id === 'duskwater')).not.toHaveProperty('parentMap')
      expect(world.maps.find((map) => map.id === 'ninth-vale')).not.toHaveProperty('parentMap')
    })
  })
})
