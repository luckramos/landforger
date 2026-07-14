import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../routes'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { setRepository } from '../state/repository'
import { useSessionStore } from '../state/sessionStore'
import { createInMemoryStorage } from './testStorage'

beforeEach(() => {
  setRepository(new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles))
  useSessionStore.setState({ user: { name: 'Sera Valen', email: 'sera@landforger.io' } })
})

afterEach(() => {
  setRepository(undefined)
})

describe('UserMenu', () => {
  function renderWorlds() {
    return render(
      <MemoryRouter initialEntries={['/worlds']}>
        <AppRoutes />
      </MemoryRouter>,
    )
  }

  it('opens from the avatar with the user block and English items', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale') // settle the async world load
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
    const menu = screen.getByRole('menu')
    expect(menu.textContent).toContain('Sera Valen')
    expect(menu.textContent).toContain('sera@landforger.io')
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeTruthy()
    // English labels — the design's Portuguese ("Perfil"/"Configurações"/"Sair") is a bug.
    expect(menu.textContent).not.toContain('Perfil')
    expect(menu.textContent).not.toContain('Sair')
  })

  it('shows the avatar initials', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale')
    expect(screen.getByRole('button', { name: 'User menu' }).textContent).toBe('SV')
  })

  it('logs out to /login and clears the fake session', async () => {
    renderWorlds()
    await screen.findByText('The Ninth Vale')
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Chart your worlds.' })).toBeTruthy()
    expect(useSessionStore.getState().user).toBeNull()
  })
})
