import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '../routes'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('route skeleton', () => {
  const cases: Array<[path: string, heading: string]> = [
    ['/login', 'Auth'],
    ['/worlds', 'Worlds'],
    ['/w/ninth-vale', 'Dashboard'],
    ['/w/ninth-vale/p/sera', 'Page'],
    ['/w/ninth-vale/c/characters', 'Category'],
    ['/w/ninth-vale/t/coastal', 'Tag'],
    ['/w/ninth-vale/map', 'Root Map'],
    ['/w/ninth-vale/map/duskwater', 'Map'],
    ['/w/ninth-vale/library', 'Map Library'],
  ]

  it.each(cases)('%s renders the %s placeholder', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
  })

  it('echoes route params on the placeholder', () => {
    renderAt('/w/ninth-vale/p/sera')
    expect(screen.getByText(/world: ninth-vale/)).toBeTruthy()
    expect(screen.getByText(/slug: sera/)).toBeTruthy()
  })

  it('/ redirects to /login', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Auth' })).toBeTruthy()
  })

  it('unknown routes render the soft 404', () => {
    renderAt('/definitely/not/a/route')
    expect(screen.getByText(/soft 404/)).toBeTruthy()
  })
})
