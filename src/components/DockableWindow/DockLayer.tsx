import { AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import type { Page, World } from '../../domain/types'
import { GraphPanel } from '../../graph/GraphPanel'
import { useDockStore } from '../../state/dockStore'

export interface DockLayerProps {
  world: World
  pages: Page[]
  /** The Page currently under the windows, which scopes the Graph's local view. */
  pageSlug?: string
}

/**
 * Renders the store-driven dockable windows. Mounted by DashboardShell outside
 * the pathname-keyed `.view`, and its open/closed state lives in the dock store
 * rather than the URL — so navigating between Pages never unmounts a window.
 *
 * This slice (#53) drives the Relationship Graph only; the Timeline and
 * Reference Canvas still open through the shell's `?panel=` conditionals until
 * #54 migrates them here.
 */
export function DockLayer({ world, pages, pageSlug }: DockLayerProps) {
  const graphOpen = useDockStore((state) => state.panels.graph.open)
  const close = useDockStore((state) => state.close)
  const navigate = useNavigate()

  return (
    <AnimatePresence>
      {graphOpen && (
        <GraphPanel
          key="graph"
          world={world}
          pages={pages}
          focalSlug={pageSlug}
          onClose={() => close('graph')}
          onNavigatePage={(slug) => navigate(`/w/${world.slug}/p/${slug}`)}
        />
      )}
    </AnimatePresence>
  )
}
