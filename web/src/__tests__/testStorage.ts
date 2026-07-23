/**
 * A minimal in-memory `Storage` implementation for tests.
 *
 * We don't rely on the ambient `localStorage` global here: under this
 * repo's vitest + happy-dom + Node 26 combination, Node's own
 * experimental `localStorage` global (gated behind `--localstorage-file`,
 * see https://nodejs.org/api/globals.html#localstorage) already exists on
 * `globalThis` before vitest's environment ever runs. Vitest's
 * `populateGlobal` only copies a window property onto `global` when the
 * key is *not already present* on `global` (see `vitest/dist/chunks/index.*.js`,
 * `getWindowKeys`'s `if (k in global) return keysArray.includes(k)`)
 * — so happy-dom's real, working `Storage` never overwrites Node's
 * non-functional stand-in, and `globalThis.localStorage` resolves to
 * `undefined` in every test. A real browser has no such collision.
 * `LocalStorageWorldRepository` accepts any `Storage`-shaped object via
 * constructor injection, so tests use this instead — same production
 * code path, deterministic, isolated per test.
 */
export function createInMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value))
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => {
      data.clear()
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
  }
}
