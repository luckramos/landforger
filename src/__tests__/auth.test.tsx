import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../routes'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { setRepository } from '../state/repository'
import { useSessionStore } from '../state/sessionStore'
import { createInMemoryStorage } from './testStorage'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // /worlds (the post-submit destination) reads through the repository seam.
  setRepository(new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles))
  useSessionStore.setState({ user: null })
})

afterEach(() => {
  setRepository(undefined)
  vi.useRealTimers()
})

describe('Auth screen', () => {
  it('renders the prefilled demo credentials and the demo hint', () => {
    renderLogin()
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'sera@landforger.io')
    expect(screen.getByLabelText('Password')).toHaveProperty('value', 'saltandcinder')
    expect(screen.getByText(/Demo build — any credentials sign you straight in/)).toBeTruthy()
  })

  it('submit with empty fields shakes the form, shows an inline error, and does not navigate', () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enter your worlds' }))

    expect(screen.getByRole('alert').textContent).toContain('Enter your email and password')
    const form = screen.getByRole('alert').closest('form')!
    expect(form.style.animation).toContain('authShake')
    // Still on the Auth screen — no navigation happened.
    expect(screen.getByRole('heading', { name: 'Chart your worlds.' })).toBeTruthy()
  })

  it('successful submit plays the burst then navigates to /worlds after 780ms', async () => {
    vi.useFakeTimers()
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Enter your worlds' }))

    // Burst overlay is up; navigation has not fired yet.
    expect(screen.getByText('Entering your worlds…')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(779)
    })
    expect(screen.queryByText(/Welcome back/)).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    vi.useRealTimers()
    expect(await screen.findByRole('heading', { name: /Welcome back, Sera\./ })).toBeTruthy()
    // The fake session recorded the signed-in user.
    expect(useSessionStore.getState().user).toEqual({ name: 'Sera Valen', email: 'sera@landforger.io' })
  })

  it('mode toggle swaps the copy to signup (Name field, terms) and back', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))

    expect(screen.getByRole('heading', { name: 'Forge a new account.' })).toBeTruthy()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByText(/Cartographer's Terms/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Forge your account' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in instead' }))
    expect(screen.getByRole('heading', { name: 'Chart your worlds.' })).toBeTruthy()
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('signup mode requires a name — empty name shakes instead of navigating', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forge your account' }))

    expect(screen.getByRole('alert').textContent).toContain('name')
    expect(screen.getByRole('heading', { name: 'Forge a new account.' })).toBeTruthy()
  })
})
