import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageWorldRepository } from '../../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../../repository/fixtures'
import { AppRoutes } from '../../routes'
import { setRepository } from '../../state/repository'
import { createInMemoryStorage } from '../../__tests__/testStorage'

let repository: LocalStorageWorldRepository

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
  repository = new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles)
  setRepository(repository)
})

afterEach(() => setRepository(undefined))

describe('Maps viewing screen', () => {
  it('renders the Root Map from _world.md, filters Pins and changes the persisted Active Era', async () => {
    await renderAt('/w/ninth-vale/map')
    expect(await screen.findByRole('heading', { name: 'The Drowned Coast' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Map of The Drowned Coast' }).getAttribute('src')).toBe('/maps/drowned-coast-saltcinder.svg')
    expect(screen.getByRole('button', { name: 'The Ninth Vale' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'The Sundering' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /The Drowning Years/ }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))?.activeEra).toBe('era-drowning'))
    expect(screen.getByRole('img', { name: 'Map of The Drowned Coast' }).getAttribute('src')).toBe('/maps/drowned-coast-charts.svg')
    expect(document.querySelector('img[src="/maps/drowned-coast-saltcinder.svg"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'The Sundering' })).toBeTruthy()
  })

  it('crossfades an Era image into the no-image state without carrying images between Maps', async () => {
    const world = await repository.getWorld('ninth-vale')
    await repository.updateWorld('ninth-vale', {
      activeEra: 'era-charts',
      maps: world!.maps.map((map) => map.id === 'drowned-coast'
        ? { ...map, images: { 'era-charts': '/maps/drowned-coast-charts.svg' } }
        : map),
    })
    await renderAt('/w/ninth-vale/map')
    expect(await screen.findByRole('img', { name: 'Map of The Drowned Coast' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /The Founding Tides/ }))
    expect(await screen.findByText('No chart survives from this Era.')).toBeTruthy()
    expect(document.querySelector('img[src="/maps/drowned-coast-charts.svg"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'The Ninth Vale' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Pin inspector' })).getByRole('button', { name: 'Enter The Ninth Vale map' }))
    expect(await screen.findByRole('heading', { name: 'The Ninth Vale' })).toBeTruthy()
    expect(document.querySelector('img[src="/maps/drowned-coast-charts.svg"]')).toBeNull()
  })

  it('supports bounded zoom controls and keeps Pins counter-scaled', async () => {
    await renderAt('/w/ninth-vale/map')
    const stage = await screen.findByTestId('map-stage')
    const pin = screen.getByRole('button', { name: 'The Ninth Vale' })
    for (let count = 0; count < 20; count += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(stage.getAttribute('data-zoom')).toBe('3.4')
    expect(pin.getAttribute('style')).toContain('--pin-scale: 0.29411764705882354')
    for (let count = 0; count < 30; count += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(stage.getAttribute('data-zoom')).toBe('0.6')
  })

  it('opens an inspector and drills into a child Map with breadcrumbs back up', async () => {
    await renderAt('/w/ninth-vale/map')
    fireEvent.click(await screen.findByRole('button', { name: 'Duskwater' }))
    const inspector = screen.getByRole('complementary', { name: 'Pin inspector' })
    expect(within(inspector).getByText('The last city on the coast that still calls itself a city, one flood at a time.')).toBeTruthy()
    expect(within(inspector).getByText('Pinned on 1 map')).toBeTruthy()
    expect(within(inspector).getByRole('link', { name: 'Open full page' }).getAttribute('href')).toBe('/w/ninth-vale/p/duskwater')
    fireEvent.click(within(inspector).getByRole('button', { name: 'Read in dock' }))
    expect(screen.getByRole('complementary', { name: 'Docked reader' })).toBeTruthy()

    fireEvent.click(within(inspector).getByRole('button', { name: 'Enter Duskwater map' }))
    expect(await screen.findByRole('heading', { name: 'Duskwater' })).toBeTruthy()
    const breadcrumbs = screen.getByRole('navigation', { name: 'Map breadcrumbs' })
    expect(within(breadcrumbs).getByRole('link', { name: 'The Drowned Coast' })).toBeTruthy()
    expect(screen.getByTestId('map-stage').getAttribute('data-transition')).toBe('in')
    expect(screen.getByTestId('map-stage').style.transformOrigin).toBe('40% 58%')
    fireEvent.animationEnd(screen.getByTestId('map-stage'))
    expect(screen.getByTestId('map-stage').style.transformOrigin).toBe('50% 50%')

    fireEvent.click(screen.getByRole('button', { name: 'Ashthorn Keep' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Pin inspector' })).getByRole('button', { name: 'Enter Ashthorn Keep map' }))
    expect(await screen.findByRole('heading', { name: 'Ashthorn Keep' })).toBeTruthy()
    expect(screen.getByTestId('map-stage').style.transformOrigin).toBe('80% 25%')
    const deepBreadcrumbs = screen.getByRole('navigation', { name: 'Map breadcrumbs' })
    expect(within(deepBreadcrumbs).getByRole('link', { name: 'Duskwater' })).toBeTruthy()
    fireEvent.click(within(deepBreadcrumbs).getByRole('link', { name: 'The Drowned Coast' }))
    expect(await screen.findByRole('heading', { name: 'The Drowned Coast' })).toBeTruthy()
    expect(screen.getByTestId('map-stage').getAttribute('data-transition')).toBe('out')
    expect(screen.getByTestId('map-stage').style.transformOrigin).toBe('40% 58%')
  })

  it('resolves a Page deep link to its Map with the matching Pin selected', async () => {
    await renderAt('/w/ninth-vale/map?page=sera')
    expect(await screen.findByRole('heading', { name: 'Duskwater' })).toBeTruthy()
    const inspector = screen.getByRole('complementary', { name: 'Pin inspector' })
    expect(within(inspector).getByRole('heading', { name: 'Sera Valen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sera Valen' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the Active Era when a Page deep link selects a currently filtered Pin', async () => {
    await renderAt('/w/ninth-vale/map?page=the-sundering')
    const inspector = await screen.findByRole('complementary', { name: 'Pin inspector' })
    expect(within(inspector).getByRole('heading', { name: 'The Sundering' })).toBeTruthy()
    expect(within(inspector).getByText('This Pin is hidden in the Active Era.')).toBeTruthy()
    expect((await repository.getWorld('ninth-vale'))?.activeEra).toBe('era-saltcinder')
  })

  it('offers See on map only for Pages with a Pin and preserves the Page selection in the URL', async () => {
    const pinned = await renderAt('/w/ninth-vale/p/sera')
    expect((await screen.findByRole('link', { name: 'See on map' })).getAttribute('href')).toBe('/w/ninth-vale/map?page=sera')
    pinned.unmount()

    await renderAt('/w/ninth-vale/p/emberglass')
    await screen.findByRole('heading', { name: 'Emberglass' })
    expect(screen.queryByRole('link', { name: 'See on map' })).toBeNull()
  })
})
