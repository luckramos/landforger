// In-memory page registry: slug -> title. The slug is the only thing stored in
// MD files ([[slug]]); titles live here and are looked up at render time.

const pages = new Map<string, string>([
  ['duskwater', 'Duskwater'],
  ['sera', 'Sera'],
  ['ember-cycle', 'The Ember Cycle'],
])

let version = 0
const listeners = new Set<() => void>()

export const registry = {
  titleFor(slug: string): string {
    return pages.get(slug) ?? slug
  },
  has(slug: string): boolean {
    return pages.has(slug)
  },
  rename(slug: string, newTitle: string) {
    pages.set(slug, newTitle)
    version += 1
    listeners.forEach(l => l())
  },
  entries(): Array<{ slug: string; title: string }> {
    return [...pages.entries()].map(([slug, title]) => ({ slug, title }))
  },
  subscribe(l: () => void): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getVersion() {
    return version
  },
}
