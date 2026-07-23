import { derivePageReferences, type BacklinkKind } from '../domain/backlinks'
import type { Category, Page } from '../domain/types'

export interface GraphNode {
  slug: string
  title: string
  category: Category
  degree: number
}

export interface GraphEdge {
  key: string
  sourceSlug: string
  targetSlug: string
  kinds: BacklinkKind[]
}

export interface RelationshipGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  focalSlug?: string
}

export type GraphScope =
  | { scope: 'global'; categories?: ReadonlySet<Category> }
  | { scope: 'local'; focalSlug: string; categories?: ReadonlySet<Category> }

function edgeKey(a: string, b: string): [string, string, string] {
  const [sourceSlug, targetSlug] = a.localeCompare(b) <= 0 ? [a, b] : [b, a]
  return [sourceSlug, targetSlug, `${sourceSlug}\u0000${targetSlug}`]
}

/**
 * Builds the graph's immutable frame from the same three live sources as the
 * Backlink index. Ghost targets and self-links have no drawable edge.
 */
export function buildRelationshipGraph(pages: Page[], options: GraphScope): RelationshipGraph {
  const pagesBySlug = new Map(pages.map((page) => [page.slug, page]))
  const edgeKinds = new Map<string, { sourceSlug: string; targetSlug: string; kinds: Set<BacklinkKind> }>()

  const addEdge = (sourcePageSlug: string, referencedSlug: string, kind: BacklinkKind) => {
    if (sourcePageSlug === referencedSlug || !pagesBySlug.has(referencedSlug)) return
    const [sourceSlug, targetSlug, key] = edgeKey(sourcePageSlug, referencedSlug)
    const existing = edgeKinds.get(key) ?? { sourceSlug, targetSlug, kinds: new Set<BacklinkKind>() }
    existing.kinds.add(kind)
    edgeKinds.set(key, existing)
  }

  for (const source of pages) {
    for (const reference of derivePageReferences(source)) {
      for (const kind of reference.kinds) addEdge(source.slug, reference.targetSlug, kind)
    }
  }

  const allEdges: GraphEdge[] = [...edgeKinds.values()]
    .map(({ sourceSlug, targetSlug, kinds }) => ({
      key: `${sourceSlug}--${targetSlug}`,
      sourceSlug,
      targetSlug,
      kinds: [...kinds],
    }))
    .sort((a, b) => a.key.localeCompare(b.key))

  let visible = new Set(
    pages
      .filter((page) => !options.categories || options.categories.has(page.category))
      .map((page) => page.slug),
  )

  if (options.scope === 'local') {
    const neighbors = new Set<string>()
    for (const edge of allEdges) {
      if (edge.sourceSlug === options.focalSlug) neighbors.add(edge.targetSlug)
      if (edge.targetSlug === options.focalSlug) neighbors.add(edge.sourceSlug)
    }
    // The focal Page remains the visual anchor even when its own Category
    // chip is disabled; chips narrow its neighbors, never erase the context.
    visible = new Set([
      ...(pagesBySlug.has(options.focalSlug) ? [options.focalSlug] : []),
      ...[...neighbors].sort().filter((slug) => visible.has(slug)),
    ])
  }

  const edges = allEdges.filter((edge) => visible.has(edge.sourceSlug) && visible.has(edge.targetSlug))
  const degree = new Map<string, number>()
  for (const edge of edges) {
    degree.set(edge.sourceSlug, (degree.get(edge.sourceSlug) ?? 0) + 1)
    degree.set(edge.targetSlug, (degree.get(edge.targetSlug) ?? 0) + 1)
  }

  const nodeFor = (page: Page): GraphNode => ({
    slug: page.slug,
    title: page.title,
    category: page.category,
    degree: degree.get(page.slug) ?? 0,
  })
  const nodes = options.scope === 'local'
    ? [options.focalSlug, ...[...visible].filter((slug) => slug !== options.focalSlug).sort()]
        .map((slug) => pagesBySlug.get(slug))
        .filter((page): page is Page => Boolean(page))
        .map(nodeFor)
    : pages.filter((page) => visible.has(page.slug)).map(nodeFor)

  return { nodes, edges, focalSlug: options.scope === 'local' ? options.focalSlug : undefined }
}
