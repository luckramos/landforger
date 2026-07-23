import type { FixtureFiles } from './LocalStorageWorldRepository'

/**
 * Every fixture world's `.md` files (Worlds and Pages alike), raw-imported
 * at build time. Passed to `LocalStorageWorldRepository` to seed
 * `localStorage` on first load; ignored on every subsequent load.
 */
export const fixtureFiles: FixtureFiles = import.meta.glob('../fixtures/worlds/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as FixtureFiles
