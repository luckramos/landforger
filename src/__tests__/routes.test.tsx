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

describe('routes', () => {
  it('/w/:world/library renders the real Map Library', async () => {
    renderAt('/w/ninth-vale/library')
    expect(await screen.findByRole('heading', { name: 'Map Library' })).toBeTruthy()
  })

  it('/w/:world, /c/:category and /t/:tag render the real Dashboard views', async () => {
    const home = renderAt('/w/ninth-vale')
    expect(await screen.findByRole('heading', { name: 'The Ninth Vale' })).toBeTruthy()
    home.unmount()

    const category = renderAt('/w/ninth-vale/c/characters')
    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeTruthy()
    category.unmount()

    renderAt('/w/ninth-vale/t/coastal')
    expect(await screen.findByRole('heading', { name: '#coastal' })).toBeTruthy()
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

  it('renders root and explicit Map routes from _world.md', async () => {
    const root = renderAt('/w/ninth-vale/map')
    expect(await screen.findByRole('heading', { name: 'The Drowned Coast' })).toBeTruthy()
    root.unmount()
    renderAt('/w/ninth-vale/map/duskwater')
    expect(await screen.findByRole('heading', { name: 'Duskwater' })).toBeTruthy()
  })

  it('/ redirects to /login', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Chart your worlds.' })).toBeTruthy()
  })

  it('?panel=timeline renders the refresh-safe Timeline panel', async () => {
    renderAt('/w/ninth-vale?panel=timeline')
    expect(await screen.findByRole('dialog', { name: 'Timeline' })).toBeTruthy()
  })

  it('?panel=graph renders the refresh-safe relationship graph', () => {
    renderAt('/w/ninth-vale?panel=graph')
    return screen.findByRole('dialog', { name: 'Relationship graph' }).then((element) => expect(element).toBeTruthy())
  })

  it('unknown routes render the soft 404', () => {
    renderAt('/definitely/not/a/route')
    expect(screen.getByText(/soft 404/)).toBeTruthy()
  })
})
