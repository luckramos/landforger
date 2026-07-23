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

  it('promotes the compositor layer only while actively panning/zooming, releasing it at rest (#62)', async () => {
    await renderAt('/w/ninth-vale/map')
    const stage = await screen.findByTestId('map-stage')
    const viewport = stage.parentElement!
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}) }),
    })
    expect(stage.hasAttribute('data-active')).toBe(false)

    // Zooming promotes the layer for the settling transition, then releases it.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(stage.getAttribute('data-active')).toBe('true')
    fireEvent.transitionEnd(stage)
    expect(stage.hasAttribute('data-active')).toBe(false)

    // Panning promotes the layer for the drag and releases it on pointer up.
    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100 })
    expect(stage.getAttribute('data-active')).toBe('true')
    fireEvent.pointerMove(document, { clientX: 140, clientY: 120 })
    fireEvent.pointerUp(document)
    expect(stage.hasAttribute('data-active')).toBe(false)
  })

  it('does not promote the compositor layer when zooming is already clamped at the bound (#62)', async () => {
    await renderAt('/w/ninth-vale/map')
    const stage = await screen.findByTestId('map-stage')

    // Drive the zoom to its maximum, settling each step.
    for (let step = 0; step < 30; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
      fireEvent.transitionEnd(stage)
    }
    expect(stage.hasAttribute('data-active')).toBe(false)

    // At the bound the transform can't change, so no transitionend would ever
    // fire to release the layer — it must never be promoted in the first place.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(stage.hasAttribute('data-active')).toBe(false)
  })

  it('opens an inspector and drills into a child Map with breadcrumbs back up', async () => {
    await renderAt('/w/ninth-vale/map')
    fireEvent.click(await screen.findByRole('button', { name: 'Duskwater' }))
    const inspector = screen.getByRole('complementary', { name: 'Pin inspector' })
    expect(within(inspector).getByText('The last city on the coast that still calls itself a city, one flood at a time.')).toBeTruthy()
    expect(within(inspector).getByText('Pinned on 1 map')).toBeTruthy()
    expect(within(inspector).getByRole('link', { name: 'Open full page' }).getAttribute('href')).toBe('/w/ninth-vale/p/duskwater')
    fireEvent.click(within(inspector).getByRole('button', { name: 'Read in dock' }))
    expect(screen.getByRole('dialog', { name: 'Duskwater' })).toBeTruthy()

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

  it('surfaces up one level from a child Map through the ascend control', async () => {
    await renderAt('/w/ninth-vale/map')
    // The Root Map has no parent, so there is nothing to ascend to.
    expect(screen.queryByRole('button', { name: /^Surface up to/ })).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: 'Duskwater' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Pin inspector' })).getByRole('button', { name: 'Enter Duskwater map' }))
    expect(await screen.findByRole('heading', { name: 'Duskwater' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Surface up to The Drowned Coast' }))
    expect(await screen.findByRole('heading', { name: 'The Drowned Coast' })).toBeTruthy()
    expect(screen.getByTestId('map-stage').getAttribute('data-transition')).toBe('out')
  })

  // The burst disc is gone: the route swap is now a View Transition, so the
  // Pin inspector's link opens the Page immediately with no interstitial.
  it('opens a full Page straight from the Pin inspector', async () => {
    await renderAt('/w/ninth-vale/map')
    fireEvent.click(await screen.findByRole('button', { name: 'Duskwater' }))
    const inspector = screen.getByRole('complementary', { name: 'Pin inspector' })
    fireEvent.click(within(inspector).getByRole('link', { name: 'Open full page' }))

    expect(screen.queryByRole('status', { name: /^Opening/ })).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Duskwater' })).toBeTruthy()
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

  it('adds duplicate Page placements with inherited Eras and persists their clamped positions', async () => {
    const sera = await repository.getPage('ninth-vale', 'sera')
    await renderAt('/w/ninth-vale/map')
    const stage = await screen.findByTestId('map-stage')
    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}) }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add Pin' }))
    expect(screen.getByRole('heading', { name: /Characters/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Locations/ })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Pages' }), { target: { value: 'Sera' } })
    fireEvent.click(screen.getByRole('button', { name: /Place Sera Valen/ }))
    expect(screen.getByText(/Click the Map to place Sera Valen/)).toBeTruthy()
    fireEvent.click(stage, { clientX: 990, clientY: -20 })

    await waitFor(async () => {
      const world = await repository.getWorld('ninth-vale')
      const placed = world!.pins.find((pin) => pin.mapId === 'drowned-coast' && pin.pageSlug === 'sera')
      expect(placed).toMatchObject({ x: 98, y: 2, eras: sera!.eras })
    })
  })

  it('drags Pins in edit-layout mode and persists the safe-area coordinates', async () => {
    await renderAt('/w/ninth-vale/map')
    const stage = await screen.findByTestId('map-stage')
    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}) }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'The Ninth Vale' }), { button: 0, clientX: 625, clientY: 350 })
    fireEvent.pointerMove(document, { clientX: -100, clientY: 1200 })
    fireEvent.pointerUp(document)

    await waitFor(async () => {
      const moved = (await repository.getWorld('ninth-vale'))!.pins.find((pin) => pin.id === 'pin-ninth-vale')
      expect(moved).toMatchObject({ x: 2, y: 98 })
    })
  })

  it('narrows a Pin to the Page intersection and refuses to remove its last Era', async () => {
    await renderAt('/w/ninth-vale/map')
    fireEvent.click(await screen.findByRole('button', { name: 'Edit layout' }))
    fireEvent.click(screen.getByRole('button', { name: 'Order of the Ember' }))
    const inspector = screen.getByRole('complementary', { name: 'Pin inspector' })
    const drowning = within(inspector).getByRole('checkbox', { name: 'The Drowning Years' })
    const salt = within(inspector).getByRole('checkbox', { name: 'The Salt & Cinder Days' })
    fireEvent.click(drowning)
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.pins.find((pin) => pin.id === 'pin-order-ember')?.eras).toEqual(['era-saltcinder']))
    fireEvent.click(salt)
    expect((salt as HTMLInputElement).checked).toBe(true)
    expect((await repository.getWorld('ninth-vale'))!.pins.find((pin) => pin.id === 'pin-order-ember')?.eras).toEqual(['era-saltcinder'])
  })

  it('creates an empty child Map from a Pin and persists both hierarchy links', async () => {
    await renderAt('/w/ninth-vale/map')
    fireEvent.click(await screen.findByRole('button', { name: 'Edit layout' }))
    fireEvent.click(screen.getByRole('button', { name: 'The Sundering' }))
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Pin inspector' })).getByRole('button', { name: 'Create child Map' }))

    await waitFor(async () => {
      const world = (await repository.getWorld('ninth-vale'))!
      expect(world.maps.find((map) => map.id === 'the-sundering')).toMatchObject({ parentMap: 'drowned-coast', parentPin: 'pin-the-sundering' })
      expect(world.pins.find((pin) => pin.id === 'pin-the-sundering')?.childMap).toBe('the-sundering')
    })
  })

  it('keeps Timeless Pin Eras read-only and removes only the chosen placement', async () => {
    await renderAt('/w/ninth-vale/map')
    fireEvent.click(await screen.findByRole('button', { name: 'Edit layout' }))
    fireEvent.click(screen.getByRole('button', { name: 'The Ninth Vale' }))
    const inspector = screen.getByRole('complementary', { name: 'Pin inspector' })
    expect(within(inspector).getByText(/Timeless/)).toBeTruthy()
    expect(within(inspector).queryByRole('checkbox')).toBeNull()
    fireEvent.click(within(inspector).getByRole('button', { name: 'Remove placement' }))
    await waitFor(async () => expect((await repository.getWorld('ninth-vale'))!.pins.some((pin) => pin.id === 'pin-ninth-vale')).toBe(false))
  })

  it('focuses a Pin from the spotlight search and flags it for the highlight', async () => {
    await renderAt('/w/ninth-vale/map')
    await screen.findByRole('heading', { name: 'The Drowned Coast' })
    fireEvent.click(screen.getByRole('button', { name: /Search Pins/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Search Pins' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Search Pins on this Map' }), { target: { value: 'ninth' } })
    fireEvent.click(within(dialog).getByRole('option', { name: /The Ninth Vale/ }))

    const pin = screen.getByRole('button', { name: 'The Ninth Vale' })
    expect(pin.getAttribute('aria-pressed')).toBe('true')
    expect(pin.hasAttribute('data-focused')).toBe(true)
  })

  it('renames the current Map live from Chart settings and persists it through the repository', async () => {
    await renderAt('/w/ninth-vale/map')
    fireEvent.click(await screen.findByRole('button', { name: 'Map settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Map settings' })
    const input = within(dialog).getByLabelText('Map title') as HTMLInputElement
    expect(input.value).toBe('The Drowned Coast')

    // The panel edits live: committing the field (blur/Enter) persists the name.
    fireEvent.change(input, { target: { value: 'The Sunken Reach' } })
    fireEvent.blur(input)

    await waitFor(async () => {
      const map = (await repository.getWorld('ninth-vale'))!.maps.find((candidate) => candidate.id === 'drowned-coast')!
      expect(map.title).toBe('The Sunken Reach')
    })
    expect(screen.getByRole('heading', { name: 'The Sunken Reach' })).toBeTruthy()
  })

  it('switches the current Map to a chart-per-era model and reveals the era stratigraphy', async () => {
    await renderAt('/w/ninth-vale/map/duskwater')
    fireEvent.click(await screen.findByRole('button', { name: 'Map settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Map settings' })
    // Duskwater ships as a single fixed chart; no per-era strata yet.
    expect(within(dialog).queryByLabelText(/^Chart for /)).toBeNull()

    fireEvent.click(within(dialog).getByRole('radio', { name: /Per era/ }))
    await waitFor(async () => {
      const map = (await repository.getWorld('ninth-vale'))!.maps.find((candidate) => candidate.id === 'duskwater')!
      expect(map.eraLinked).toBe(true)
    })
    // The era rows appear, one image field per Era in the World's order.
    expect(await within(dialog).findByLabelText('Chart for The Salt & Cinder Days')).toBeTruthy()
  })
})
