// PageScreen wiring: loads a fixture Page via the repository, persists edits
// through it (debounced ~800ms, dirty-checked), soft-404 creates unknown
// slugs. Runs under happy-dom like the rest of the suite.

import type { Editor } from '@tiptap/core'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryStorage } from '../../__tests__/testStorage'
import { pageToMarkdown } from '../../domain/page'
import type { Page, World } from '../../domain/types'
import { worldToMarkdown } from '../../domain/world'
import { LocalStorageWorldRepository, type FixtureFiles } from '../../repository/LocalStorageWorldRepository'
import { PageScreen } from '../../screens/PageScreen'

const world: World = {
  slug: 'testland',
  name: 'Testland',
  genre: 'Fantasy',
  color: 'oklch(0.68 0.1 38)',
  logline: 'A world for tests.',
  eraOrder: ['era-one'],
  activeEra: 'era-one',
  categoryTemplates: [],
  maps: [],
  pins: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  body: 'Notes.\n',
}

const alaric: Page = {
  slug: 'alaric',
  category: 'characters',
  title: 'Alaric',
  tags: [],
  summary: 'A test character.',
  eras: ['era-one'],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  customProperties: [],
  body: 'Alaric guards the [[gate-of-ash]].\n\nHe keeps the ledger.',
}

const gateOfAsh: Page = {
  ...alaric,
  slug: 'gate-of-ash',
  title: 'The Gate of Ash',
  category: 'locations',
  eras: [],
  body: 'A gate.',
}

function fixtures(): FixtureFiles {
  return {
    '/src/fixtures/worlds/testland/_world.md': worldToMarkdown(world),
    '/src/fixtures/worlds/testland/alaric.md': pageToMarkdown(alaric),
    '/src/fixtures/worlds/testland/gate-of-ash.md': pageToMarkdown(gateOfAsh),
  }
}

async function mountScreen(slug: string, storage = createInMemoryStorage()) {
  const repo = new LocalStorageWorldRepository(storage, fixtures())
  let editor: Editor | undefined
  const utils = render(
    <MemoryRouter initialEntries={[`/w/testland/p/${slug}`]}>
      <Routes>
        <Route
          path="/w/:world/p/:slug"
          element={
            <PageScreen
              repository={repo}
              onEditorReady={(e) => {
                editor = e
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  // load promises + editor mount + node-view portals
  await act(async () => {})
  await act(async () => {})
  return { ...utils, repo, storage, getEditor: () => editor }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PageScreen — loading', () => {
  it('loads the Page through the repository: eyebrow, serif title, editor body', async () => {
    const { container, getEditor } = await mountScreen('alaric')
    expect(screen.getByRole('heading', { name: 'Alaric' })).toBeTruthy()
    expect(screen.getByText('characters')).toBeTruthy()
    // body rendered through the editor, wikilink chip resolved to the live title
    expect(container.querySelector('.tiptap')?.textContent).toContain('He keeps the ledger.')
    expect(container.querySelector('[data-wikilink="gate-of-ash"]')?.textContent).toBe('The Gate of Ash')
    expect(getEditor()).toBeTruthy()
  })
})

describe('PageScreen — saving', () => {
  it('persists an edit after the debounce, and it survives repository re-instantiation', async () => {
    const { repo, storage, getEditor } = await mountScreen('alaric')
    const updatedBefore = (await repo.getPage('testland', 'alaric'))!.updated

    vi.useFakeTimers()
    act(() => {
      getEditor()!.chain().focus('end').insertContent('A line added by the test.').run()
    })
    // inside the debounce window: nothing written yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect((await repo.getPage('testland', 'alaric'))!.body).not.toContain('A line added by the test.')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    vi.useRealTimers()
    await act(async () => {})

    expect(screen.getByText('Saved')).toBeTruthy()
    const saved = (await repo.getPage('testland', 'alaric'))!
    expect(saved.body).toContain('A line added by the test.')
    expect(saved.body).toContain('[[gate-of-ash]]') // wikilink kept as MD, per ADR 0001
    expect(saved.updated).not.toBe(updatedBefore)

    // survives re-instantiation over the same storage (MD is the source of truth)
    const rehydrated = new LocalStorageWorldRepository(storage, fixtures())
    expect((await rehydrated.getPage('testland', 'alaric'))!.body).toContain('A line added by the test.')
  })

  it('does not rewrite MD when the doc has not actually changed (dirty check)', async () => {
    const { repo, getEditor } = await mountScreen('alaric')
    const updatePage = vi.spyOn(repo, 'updatePage')

    vi.useFakeTimers()
    // no edits at all: the debounce never even schedules
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(updatePage).not.toHaveBeenCalled()

    // an edit undone within the debounce window serializes back to the
    // last-saved body — the flush must skip the write
    act(() => {
      getEditor()!.chain().focus('end').insertContent('Ephemeral.').run()
    })
    act(() => {
      getEditor()!.chain().undo().run()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(updatePage).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('keeps the newest pending edit when a repository write fails', async () => {
    const { repo, getEditor } = await mountScreen('alaric')
    const realUpdatePage = repo.updatePage.bind(repo)
    vi.spyOn(repo, 'updatePage')
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockImplementation(realUpdatePage)

    vi.useFakeTimers()
    act(() => {
      getEditor()!.chain().focus('end').insertContent('Retried text.').run()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })
    await act(async () => {})

    expect((await repo.getPage('testland', 'alaric'))!.body).toContain('Retried text.')
    expect(repo.updatePage).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('PageScreen — unknown slug (soft-404)', () => {
  it('offers to create the missing Page, then loads it', async () => {
    const { repo } = await mountScreen('silver-fen')
    expect(screen.getByText(/Nothing charted at/)).toBeTruthy()

    const button = screen.getByRole('button', { name: "Create 'silver-fen' page?" })
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})

    expect(screen.getByRole('heading', { name: 'Silver Fen' })).toBeTruthy()
    const created = (await repo.getPage('testland', 'silver-fen'))!
    expect(created.title).toBe('Silver Fen')
  })
})
