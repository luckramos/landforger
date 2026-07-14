import type { Category, Page } from '../domain/types'

export type WikiLinkPage = Pick<Page, 'slug' | 'title' | 'category' | 'summary' | 'tags'>

/**
 * Small external store shared by suggestion plugins and React node views.
 * Slug is the identity; the remaining fields are always read live.
 */
export class WikiLinkRegistry {
  private pages = new Map<string, WikiLinkPage>()
  private listeners = new Set<() => void>()
  private revision = 0

  constructor(pages: WikiLinkPage[] = []) {
    this.pages = new Map(pages.map((page) => [page.slug, page]))
  }

  update(pages: WikiLinkPage[]): void {
    this.pages = new Map(pages.map((page) => [page.slug, page]))
    this.revision += 1
    this.listeners.forEach((listener) => listener())
  }

  get(slug: string): WikiLinkPage | undefined {
    return this.pages.get(slug)
  }

  search(query: string): WikiLinkPage[] {
    const needle = query.trim().toLocaleLowerCase()
    return [...this.pages.values()]
      .filter((page) => !needle || `${page.title} ${page.slug}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 8)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getRevision = (): number => this.revision
}

export const CATEGORY_ICON: Record<Category, string> = {
  stories: '✎',
  eras: '◷',
  characters: '♙',
  locations: '⌖',
  items: '◇',
  organizations: '⌂',
  events: '✦',
}
