import { create } from 'zustand'

export interface SessionUser {
  name: string
  email: string
}

interface SessionState {
  user: SessionUser | null
  login: (user: SessionUser) => void
  logout: () => void
}

/**
 * Fake session for the mocked front-end: demo auth means any credentials
 * "pass" (Auth screen §2.1), so `login` never rejects — it just records who's
 * signed in. No route guarding lives here; that's out of this slice's scope.
 */
export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
}))
