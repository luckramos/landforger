import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createInMemoryStorage } from './testStorage'
import type { World } from '../domain/types'
import { worldToMarkdown } from '../domain/world'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { NewPageScreen } from '../screens/NewPageScreen'

const world: World = {
  slug: 'testland',
  name: 'Testland',
  genre: 'Fantasy',
  color: 'oklch(0.68 0.1 38)',
  logline: '',
  eraOrder: ['era-one'],
  activeEra: 'era-one',
  categoryTemplates: [
    { category: 'events', properties: [{ key: 'happenedOn', label: 'Happened on', type: 'date' }] },
  ],
  maps: [],
  pins: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  body: '',
}

function mount() {
  const repo = new LocalStorageWorldRepository(createInMemoryStorage(), {
    '/src/fixtures/worlds/testland/_world.md': worldToMarkdown(world),
  })
  render(
    <MemoryRouter initialEntries={['/w/testland/new']}>
      <Routes>
        <Route path="/w/:world/new" element={<NewPageScreen repository={repo} />} />
        <Route path="/w/:world/p/:slug" element={<p>Created page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return repo
}

describe('NewPageScreen', () => {
  it('creates through a per-Category form using the current Category Template', async () => {
    const repo = mount()
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The Long Night' } })
    fireEvent.change(screen.getByLabelText('Happened on'), { target: { value: '2027-10-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }))
    await act(async () => {})

    expect(screen.getByText('Created page')).toBeTruthy()
    expect(await repo.getPage('testland', 'the-long-night')).toEqual(
      expect.objectContaining({
        category: 'events',
        customProperties: [expect.objectContaining({ key: 'happenedOn', type: 'date', value: '2027-10-31' })],
      }),
    )
  })
})
