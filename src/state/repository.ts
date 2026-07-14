import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import type { WorldRepository } from '../repository/WorldRepository'

let instance: WorldRepository | undefined

/**
 * App-wide `WorldRepository` singleton, lazily constructed from real
 * `localStorage` + the shipped fixture Worlds. Lazy so importing this
 * module never touches `localStorage` until a screen actually needs it.
 */
export function getRepository(): WorldRepository {
  if (!instance) instance = new LocalStorageWorldRepository(globalThis.localStorage, fixtureFiles)
  return instance
}

/** Test-only seam: inject a repository (e.g. backed by an in-memory `Storage`), or reset to `undefined`. */
export function setRepository(repository: WorldRepository | undefined): void {
  instance = repository
}
