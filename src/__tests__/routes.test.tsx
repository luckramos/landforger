import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../routes'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { setRepository } from '../state/repository'
import { createInMemoryStorage } from './testStorage'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

// /worlds is a real screen now and reads through the repository seam.
beforeEach(() => {
  setRepository(new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles))
})

afterEach(() => {
  setRepository(undefined)
})

describe('route skeleton', () => {
  // Routes still on the shared Placeholder frame until their slices land.
  const placeholderCases: Array<[path: string, heading: string]> = [
    ['/w/ninth-vale', 'Dashboard'],
    ['/w/ninth-vale/c/characters', 'Category'],
    ['/w/ninth-vale/t/coastal', 'Tag'],
    ['/w/ninth-vale/map', 'Root Map'],
    ['/w/ninth-vale/map/duskwater', 'Map'],
    ['/w/ninth-vale/library', 'Map Library'],
  ]

  it.each(placeholderCases)('%s renders the %s placeholder', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
  })

  it('/login renders the real Auth screen', () => {
    renderAt('/login')
    expect(screen.getByRole('heading', { name: 'Chart your worlds.' })).toBeTruthy()
  })

  it('/worlds renders the real Worlds screen against repository data', async () => {
    renderAt('/worlds')
    expect(screen.getByRole('heading', { name: /Welcome back/ })).toBeTruthy()
    expect(await screen.findByText('The Ninth Vale')).toBeTruthy()
  })

  // /w/:world/p/:slug is the real Page screen since issue #20
  it('/w/ninth-vale/p/sera renders the Page screen with the fixture Page', async () => {
    renderAt('/w/ninth-vale/p/sera')
    expect(await screen.findByRole('heading', { name: 'Sera Valen' })).toBeTruthy()
  })

  it('echoes route params on the placeholder', () => {
    renderAt('/w/ninth-vale/map/duskwater')
    expect(screen.getByText(/world: ninth-vale/)).toBeTruthy()
    expect(screen.getByText(/mapId: duskwater/)).toBeTruthy()
  })

  it('/ redirects to /login', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Chart your worlds.' })).toBeTruthy()
  })

  it.each([['timeline'], ['graph']])('?panel=%s renders the panel placeholder', (panel) => {
    renderAt(`/w/ninth-vale?panel=${panel}`)
    expect(screen.getByText(`panel: ${panel} (placeholder)`)).toBeTruthy()
  })

  it('unknown routes render the soft 404', () => {
    renderAt('/definitely/not/a/route')
    expect(screen.getByText(/soft 404/)).toBeTruthy()
  })
})
