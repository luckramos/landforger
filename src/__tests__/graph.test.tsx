import { readFileSync } from 'node:fs'
import { Profiler, type ProfilerOnRenderCallback } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GraphCanvas } from '../graph/GraphPanel'
import { buildRelationshipGraph } from '../graph/graphModel'
import { LocalStorageWorldRepository } from '../repository/LocalStorageWorldRepository'
import { fixtureFiles } from '../repository/fixtures'
import { AppRoutes } from '../routes'
import { setRepository } from '../state/repository'
import { createInMemoryStorage } from './testStorage'

let repository: LocalStorageWorldRepository

beforeEach(() => {
  repository = new LocalStorageWorldRepository(createInMemoryStorage(), fixtureFiles)
  setRepository(repository)
})

afterEach(() => {
  setRepository(undefined)
  vi.restoreAllMocks()
})

async function renderAt(path: string) {
  const result = render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
  await act(async () => {})
  return result
}

describe('relationship graph panel', () => {
  it('uses the catalogued reveal cadence and overshoot motion', () => {
    const component = readFileSync('src/graph/GraphPanel.tsx', 'utf8')
    const css = readFileSync('src/graph/GraphPanel.module.css', 'utf8')

    expect(component).toContain('170 * motionScale')
    // Node core scale is driven per-connection via the --node-scale custom property.
    expect(component).toContain("setProperty('--node-scale'")
    expect(css).toContain('transform: scale(var(--node-scale, .1))')
    // Links stay hidden until both endpoints have appeared.
    expect(css).toContain(".edges line[data-revealed='true'] { opacity: .42; }")
    expect(css).toContain('calc(var(--mo, 1) * 400ms) var(--ease-overshoot-soft)')
  })

  it('opens refresh-safe from ?panel=graph and category chips filter the visible nodes', async () => {
    await renderAt('/w/ninth-vale?panel=graph')
    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    expect(within(dialog).getByText(/Global scope/)).toBeTruthy()
    expect(within(dialog).getByTestId('graph-node-sera')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: /Characters/ }))
    expect(within(dialog).queryByTestId('graph-node-sera')).toBeNull()
  })

  it("opens local scope from a Page's graph button", async () => {
    await renderAt('/w/ninth-vale/p/sera')
    fireEvent.click(await screen.findByRole('button', { name: 'Open local relationship graph' }))

    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    expect(within(dialog).getByText(/Local · Sera Valen/)).toBeTruthy()
    expect(within(dialog).getByTestId('graph-node-sera').getAttribute('data-focal')).toBe('true')
  })

  it('dims non-neighbors on hover and suppresses click-through after a drag over 3px', async () => {
    const pages = await repository.listPages('ninth-vale')
    const graph = buildRelationshipGraph(pages, { scope: 'global' })
    const seraNeighbors = new Set(graph.edges.flatMap((edge) =>
      edge.sourceSlug === 'sera' ? [edge.targetSlug] : edge.targetSlug === 'sera' ? [edge.sourceSlug] : [],
    ))
    const unrelatedSlug = graph.nodes.find((node) => node.slug !== 'sera' && !seraNeighbors.has(node.slug))?.slug
    expect(unrelatedSlug).toBeTruthy()
    await renderAt('/w/ninth-vale?panel=graph')
    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    const sera = within(dialog).getByTestId('graph-node-sera')
    const unrelated = within(dialog).getByTestId(`graph-node-${unrelatedSlug}`)

    fireEvent.mouseEnter(sera)
    expect(unrelated.getAttribute('data-dimmed')).toBe('true')
    fireEvent.mouseLeave(sera)
    expect(unrelated.getAttribute('data-dimmed')).toBeNull()

    fireEvent.pointerDown(sera, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(document, { clientX: 106, clientY: 100 })
    fireEvent.pointerUp(document, { clientX: 106, clientY: 100 })
    fireEvent.click(sera)
    expect(screen.getByRole('dialog', { name: 'Relationship graph' })).toBeTruthy()

    fireEvent.click(sera)
    expect(await screen.findByRole('heading', { name: 'Sera Valen' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Relationship graph' })).toBeNull())
  })

  it('updates edges after repository mutations and supports pan/zoom controls', async () => {
    const pages = await repository.listPages('ninth-vale')
    const before = buildRelationshipGraph(pages, { scope: 'global' })
    const existing = new Set(before.edges.map((edge) => edge.key))
    const [source, target] = pages.flatMap((left) =>
      pages
        .filter((right) => left.slug.localeCompare(right.slug) < 0 && !existing.has(`${left.slug}--${right.slug}`))
        .map((right) => [left, right] as const),
    )[0]
    const edgeId = `${source.slug}--${target.slug}`
    await renderAt('/w/ninth-vale?panel=graph')
    const dialog = await screen.findByRole('dialog', { name: 'Relationship graph' })
    const stage = within(dialog).getByTestId('graph-stage')
    const initialTransform = stage.getAttribute('transform')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    expect(stage.getAttribute('transform')).not.toBe(initialTransform)

    await act(async () => {
      await repository.updatePage('ninth-vale', source.slug, { body: `${source.body}\n[[${target.slug}]]` })
    })
    await waitFor(() => expect(dialog.querySelector(`[data-edge="${edgeId}"]`)).toBeTruthy())
  })

  it('writes physics frames directly to SVG without a React commit', () => {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const pages = Array.from({ length: 300 }, (_, index) => ({
      slug: `p-${index}`,
      title: `Page ${index}`,
      category: 'stories' as const,
      tags: [], summary: '', eras: [], created: '', updated: '', customProperties: [],
      body: index ? `[[p-${index - 1}]]` : '',
    }))
    const graph = buildRelationshipGraph(pages, { scope: 'global' })
    const commits: Parameters<ProfilerOnRenderCallback>[] = []
    render(
      <Profiler id="graph" onRender={(...args) => commits.push(args)}>
        <GraphCanvas graph={graph} onNavigate={() => {}} />
      </Profiler>,
    )
    const initialCommits = commits.length
    const before = screen.getByTestId('graph-node-p-1').getAttribute('transform')

    act(() => {
      for (let frame = 0; frame < 10; frame += 1) callbacks.shift()?.(performance.now() + 1000 + frame * 16.7)
    })

    expect(screen.getByTestId('graph-node-p-1').getAttribute('transform')).not.toBe(before)
    expect(commits).toHaveLength(initialCommits)
  })
})
