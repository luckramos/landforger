// PageScreen wiring: loads a fixture Page via the repository, persists edits
// through it (debounced ~800ms, dirty-checked), soft-404 creates unknown
// slugs. Runs under happy-dom like the rest of the suite.

import type { Editor } from '@tiptap/core'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  categoryTemplates: [
    {
      category: 'characters',
      properties: [{ key: 'role', label: 'Role', type: 'text' }],
    },
    {
      category: 'locations',
      properties: [{ key: 'parent', label: 'Parent', type: 'relation', targetCategories: ['locations'] }],
    },
  ],
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
  customProperties: [
    { key: 'motto', label: 'Motto', type: 'text', value: 'Stand watch' },
    { key: 'history', label: 'History', type: 'textarea', value: 'Raised at the gate.' },
    { key: 'rank', label: 'Rank', type: 'select', options: ['Guard', 'Captain'], value: 'Guard' },
    { key: 'portrait', label: 'Portrait', type: 'image', value: '/portraits/alaric.webp' },
    { key: 'age', label: 'Age', type: 'number', value: 31 },
    { key: 'oathDate', label: 'Oath Date', type: 'date', value: '2026-02-03' },
    { key: 'allies', label: 'Allies', type: 'relation', targetCategories: ['organizations'], value: [] },
  ],
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

const chronicle: Page = {
  ...alaric,
  slug: 'chronicle',
  title: 'The Chronicle',
  category: 'stories',
  tags: ['history'],
  eras: [],
  body: 'At dusk, [[alaric]] took the western watch.',
}

const watch: Page = {
  ...alaric,
  slug: 'the-watch',
  title: 'The Watch',
  category: 'organizations',
  eras: [],
  body: '',
  customProperties: [{ key: 'members', label: 'Members', type: 'relation', value: ['alaric'] }],
}

const eraOne: Page = {
  ...alaric,
  slug: 'era-one',
  title: 'The First Era',
  category: 'eras',
  eras: [],
  body: 'An age of beginnings.',
}

function fixtures(): FixtureFiles {
  return {
    '/src/fixtures/worlds/testland/_world.md': worldToMarkdown(world),
    '/src/fixtures/worlds/testland/alaric.md': pageToMarkdown(alaric),
    '/src/fixtures/worlds/testland/gate-of-ash.md': pageToMarkdown(gateOfAsh),
    '/src/fixtures/worlds/testland/chronicle.md': pageToMarkdown(chronicle),
    '/src/fixtures/worlds/testland/the-watch.md': pageToMarkdown(watch),
    '/src/fixtures/worlds/testland/era-one.md': pageToMarkdown(eraOne),
  }
}

async function mountScreen(slug: string, storage = createInMemoryStorage()) {
  const repo = new LocalStorageWorldRepository(storage, fixtures())
  let editor: Editor | undefined
  const utils = render(
    <MemoryRouter initialEntries={[`/w/testland/p/${slug}`]}>
      <Routes>
        <Route path="/w/:world" element={<p>World home</p>} />
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
    expect(container.querySelector('[data-wikilink="gate-of-ash"]')?.textContent).toContain('The Gate of Ash')
    expect(getEditor()).toBeTruthy()
  })

  it('navigates through a Wikilink chip', async () => {
    const { container } = await mountScreen('alaric')
    const chip = container.querySelector('[data-wikilink="gate-of-ash"]')!
    await act(async () => chip.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'The Gate of Ash' })).toBeTruthy()
  })
})

describe('PageScreen — Mentioned in', () => {
  it('groups body and Relation backlinks by Category with snippets and collapses', async () => {
    await mountScreen('alaric')
    const toggle = screen.getByRole('button', { name: /Mentioned in/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('heading', { name: 'stories' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'organizations' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'The Chronicle' })).toBeTruthy()
    expect(screen.getByText(/At dusk, Alaric took the western watch/)).toBeTruthy()
    expect(screen.getByText('Relation: Members')).toBeTruthy()

    act(() => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('link', { name: 'The Chronicle' })).toBeNull()
  })

  it('lists member Pages as live backlinks on an Era Page', async () => {
    await mountScreen('era-one')
    expect(screen.getByRole('link', { name: 'Alaric' })).toBeTruthy()
    expect(screen.getByText('Member of The First Era')).toBeTruthy()
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

describe('PageScreen — Properties', () => {
  it('renders all 7 Custom Property types and persists number and date edits to frontmatter', async () => {
    const { repo, storage } = await mountScreen('alaric')
    expect(screen.getByLabelText('Motto')).toBeTruthy()
    expect(screen.getByLabelText('History')).toBeTruthy()
    expect(screen.getByLabelText('Rank')).toBeTruthy()
    expect(screen.getByLabelText('Portrait')).toBeTruthy()
    expect(screen.getByLabelText('Age')).toBeTruthy()
    expect(screen.getByLabelText('Oath Date')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Allies' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '42' } })
    fireEvent.change(screen.getByLabelText('Oath Date'), { target: { value: '2027-05-09' } })
    await act(async () => {})

    const saved = (await repo.getPage('testland', 'alaric'))!
    expect(saved.customProperties.find((property) => property.key === 'age')?.value).toBe(42)
    expect(saved.customProperties.find((property) => property.key === 'oathDate')?.value).toBe('2027-05-09')
    const rehydrated = new LocalStorageWorldRepository(storage, fixtures())
    expect((await rehydrated.getPage('testland', 'alaric'))?.customProperties).toContainEqual(
      expect.objectContaining({ key: 'age', type: 'number', value: 42 }),
    )
  })

  it('filters a Relation picker by target Category and immediately updates backlinks', async () => {
    const { repo } = await mountScreen('alaric')
    // Picker groups by Category and starts collapsed; expand Organizations to reach The Watch.
    fireEvent.click(screen.getByRole('button', { name: 'Add Allies' }))
    expect(screen.queryByRole('button', { name: 'The Gate of Ash' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Organizations' }))
    expect(screen.getByRole('button', { name: 'The Watch' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'The Watch' }))
    await act(async () => {})
    expect(await repo.getBacklinks('testland', 'alaric')).toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceSlug: 'the-watch' })]),
    )
    expect(await repo.getBacklinks('testland', 'the-watch')).toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceSlug: 'alaric', kinds: ['relation'] })]),
    )
  })

  it('adds, renames and removes a page-local Custom Property', async () => {
    const { repo } = await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Add property' }))
    expect(screen.getAllByRole('button', { name: /^Add (text|textarea|select|relation|image|number|date) property$/ })).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: 'Add date property' }))
    await act(async () => {})

    const labelInput = screen.getByLabelText('Property name for dateProperty')
    fireEvent.change(labelInput, { target: { value: 'Coronation' } })
    await act(async () => {})
    expect((await repo.getPage('testland', 'alaric'))?.customProperties).toContainEqual(
      expect.objectContaining({ key: 'dateProperty', label: 'Coronation', type: 'date' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove Coronation' }))
    await act(async () => {})
    expect((await repo.getPage('testland', 'alaric'))?.customProperties.some((property) => property.key === 'dateProperty')).toBe(false)
  })

  it('configures options and Relation target Categories from the settings popover', async () => {
    const { repo } = await mountScreen('alaric')
    // Select options now live behind the property's settings gear and commit on Save.
    // Options are added as pills by typing and pressing Enter (Rank starts with Guard, Captain).
    fireEvent.click(screen.getByRole('button', { name: 'Configure Rank' }))
    const rankOptions = screen.getByLabelText('Options for Rank')
    fireEvent.change(rankOptions, { target: { value: 'Marshal' } })
    fireEvent.keyDown(rankOptions, { key: 'Enter' })
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Add property' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add relation property' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Configure Relation property' }))
    fireEvent.click(screen.getByLabelText('Target locations for Relation property'))
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Add Relation property' }))
    expect(screen.queryByRole('button', { name: 'The Watch' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Locations' }))
    expect(screen.getByRole('button', { name: 'The Gate of Ash' })).toBeTruthy()

    const saved = (await repo.getPage('testland', 'alaric'))!
    expect(saved.customProperties.find((property) => property.key === 'rank')?.options).toEqual(['Guard', 'Captain', 'Marshal'])
    expect(saved.customProperties.find((property) => property.key === 'relationProperty')?.targetCategories).toEqual(['locations'])
  })

  it('renders a Relation value as a Category-colored, navigable chip', async () => {
    // the-watch (organizations) → members relation → alaric (characters).
    await mountScreen('the-watch')
    const link = screen.getByRole('button', { name: 'Go to Alaric' })
    // The chip carries its target's Category color via the --chip-cat custom prop.
    const chip = link.closest('span')!
    expect(chip.style.getPropertyValue('--chip-cat')).toContain('--cat-characters')
    // …and navigates to that Page.
    fireEvent.click(link)
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'Alaric' })).toBeTruthy()
  })

  it('edits tags and Eras inline', async () => {
    const { repo } = await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'veteran' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create tag veteran' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove era The First Era' }))
    await act(async () => {})

    const saved = (await repo.getPage('testland', 'alaric'))!
    expect(saved.tags).toContain('veteran')
    expect(saved.eras).toEqual([])
  })

  it('finds an existing World tag and sets the Cover from a pasted link', async () => {
    const { repo } = await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'hist' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use tag history' }))
    // Cover is an image field at the top of the page — set it via paste-a-link.
    fireEvent.click(screen.getByRole('button', { name: 'Cover' }))
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link for Cover' }))
    fireEvent.change(screen.getByLabelText('Image URL for Cover'), { target: { value: '/covers/alaric.webp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use link for Cover' }))
    await act(async () => {})

    expect(await repo.getPage('testland', 'alaric')).toEqual(
      expect.objectContaining({ tags: ['history'], cover: '/covers/alaric.webp' }),
    )
  })
})

describe('PageScreen — lifecycle and templates', () => {
  it('renames and recategorizes while keeping slug and Properties, optionally applying the target template', async () => {
    const { repo } = await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Page actions' }))
    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'Alaric the Bold' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'locations' } })
    fireEvent.click(screen.getByLabelText('Apply target Category Template'))
    fireEvent.click(screen.getByRole('button', { name: 'Save page details' }))
    await act(async () => {})

    const saved = (await repo.getPage('testland', 'alaric'))!
    expect(saved.title).toBe('Alaric the Bold')
    expect(saved.slug).toBe('alaric')
    expect(saved.category).toBe('locations')
    expect(saved.customProperties).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'motto', value: 'Stand watch' }),
      expect.objectContaining({ key: 'parent', type: 'relation', value: [] }),
    ]))
  })

  it('edits the World Category Template and leaves the current Page untouched', async () => {
    const { repo } = await mountScreen('alaric')
    const before = (await repo.getPage('testland', 'alaric'))!.customProperties
    fireEvent.click(screen.getByRole('button', { name: 'Page actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit characters template' }))
    const dialog = screen.getByRole('dialog', { name: 'Characters template' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add property' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add number to template' }))
    fireEvent.change(screen.getByLabelText('Template property name for numberProperty'), { target: { value: 'Reputation' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await act(async () => {})

    expect((await repo.getPage('testland', 'alaric'))?.customProperties).toEqual(before)
    const future = await repo.createPage('testland', { title: 'Beren', category: 'characters' })
    expect(future.customProperties).toContainEqual(
      expect.objectContaining({ key: 'numberProperty', label: 'Reputation', type: 'number', value: 0 }),
    )
  })

  it('persists select options and Relation target Categories in a Category Template', async () => {
    const { repo } = await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Page actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit characters template' }))
    const dialog = screen.getByRole('dialog', { name: 'Characters template' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add property' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add select to template' }))
    const templateOptions = screen.getByLabelText('Options for Select property')
    fireEvent.change(templateOptions, { target: { value: 'Known' } })
    fireEvent.keyDown(templateOptions, { key: 'Enter' })
    fireEvent.change(templateOptions, { target: { value: 'Unknown' } })
    fireEvent.keyDown(templateOptions, { key: 'Enter' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add property' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add relation to template' }))
    fireEvent.click(screen.getByLabelText('Target organizations for Relation property'))
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await act(async () => {})

    const future = await repo.createPage('testland', { title: 'Template Child', category: 'characters' })
    expect(future.customProperties).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'select', options: ['Known', 'Unknown'] }),
      expect.objectContaining({ type: 'relation', targetCategories: ['organizations'] }),
    ]))
  })

  it('deletes without rewriting inbound references, leaving a Ghost link', async () => {
    const { repo } = await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Page actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    await act(async () => {})

    expect(await repo.getPage('testland', 'alaric')).toBeUndefined()
    expect((await repo.getPage('testland', 'chronicle'))?.body).toContain('[[alaric]]')
  })
})

/*
 * Issue #61: these three dialogs split their single-container entrance into
 * staggered heading → fields → actions chunks (motion.test.tsx guards the
 * ~100ms offset and bounce:0 spring at the source level, since happy-dom
 * runs no animation). What IS observable here is the structural precondition
 * the stagger depends on: three distinct, correctly ordered chunk nodes.
 */
describe('PageScreen — staggered dialog entrances (#61)', () => {
  it('renders the Page lifecycle dialog as three ordered chunks: heading, fields, actions', async () => {
    await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Page actions' }))
    const dialog = screen.getByRole('dialog', { name: 'Page lifecycle' })
    const [heading, fields, actions] = [...dialog.children] as HTMLElement[]

    expect(heading.tagName).toBe('H2')
    expect(heading.textContent).toBe('Page details')
    expect(within(fields).getByLabelText('Page title')).toBeTruthy()
    expect(within(fields).getByLabelText('Category')).toBeTruthy()
    expect(within(actions).getByRole('button', { name: 'Delete page' })).toBeTruthy()
    expect(within(actions).getByRole('button', { name: 'Save page details' })).toBeTruthy()
  })

  it('renders the Category Template dialog as three ordered chunks: heading, fields, actions', async () => {
    await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Page actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit characters template' }))
    const dialog = screen.getByRole('dialog', { name: 'Characters template' })
    const [heading, fields, actions] = [...dialog.children] as HTMLElement[]

    expect(within(heading).getByRole('heading', { name: 'Characters' })).toBeTruthy()
    expect(within(fields).getByRole('button', { name: 'Add property' })).toBeTruthy()
    expect(within(actions).getByRole('button', { name: 'Save template' })).toBeTruthy()
  })

  it('renders the auto-saving Property settings dialog as two ordered chunks: heading, fields', async () => {
    await mountScreen('alaric')
    fireEvent.click(screen.getByRole('button', { name: 'Configure Rank' }))
    const dialog = screen.getByRole('dialog', { name: 'Rank settings' })
    const [heading, fields] = [...dialog.children] as HTMLElement[]

    expect(heading.textContent).toContain('Select options')
    expect(within(fields).getByLabelText('Options for Rank')).toBeTruthy()
    // Auto-save: no Save/Cancel actions row.
    expect(screen.queryByRole('button', { name: 'Save Rank settings' })).toBeNull()
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
