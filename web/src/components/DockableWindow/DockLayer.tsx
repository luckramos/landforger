import { AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ReferenceCanvasPanel } from '../../canvas/ReferenceCanvasPanel'
import type { Page, World } from '../../domain/types'
import { GraphPanel } from '../../graph/GraphPanel'
import type { WorldRepository } from '../../repository/WorldRepository'
import { TimelinePanel } from '../../timeline/TimelinePanel'
import { useDockStore } from '../../state/dockStore'

export interface DockLayerProps {
  world: World
  pages: Page[]
  repository: WorldRepository
  /** Slug the Timeline should scroll to, from `?focus=`. */
  focusedPageSlug?: string
  /** The Page currently under the windows, which scopes the Graph's local view. */
  pageSlug?: string
}

/**
 * Renders the store-driven dockable windows. Mounted by DashboardShell outside
 * the pathname-keyed `.view`, and each window's open/closed state lives in the
 * dock store rather than the URL — so navigating between Pages never unmounts a
 * window, and several can be open at once. Stacking order and click-to-front
 * are the store's job; this layer only mounts what the store says is open.
 */
export function DockLayer({ world, pages, repository, focusedPageSlug, pageSlug }: DockLayerProps) {
  const panels = useDockStore((state) => state.panels)
  const close = useDockStore((state) => state.close)
  const navigate = useNavigate()

  return (
    <AnimatePresence>
      {panels.timeline.open && (
        <TimelinePanel
          key="timeline"
          world={world}
          pages={pages}
          repository={repository}
          focusPage={focusedPageSlug}
          onClose={() => close('timeline')}
          onNavigatePage={(slug) => navigate(`/w/${world.slug}/p/${slug}`)}
        />
      )}

      {panels.graph.open && (
        <GraphPanel
          key="graph"
          world={world}
          pages={pages}
          focalSlug={pageSlug}
          onClose={() => close('graph')}
          onNavigatePage={(slug) => navigate(`/w/${world.slug}/p/${slug}`)}
        />
      )}

      {panels.canvas.open && (
        <ReferenceCanvasPanel
          key="canvas"
          world={world}
          repository={repository}
          onClose={() => close('canvas')}
        />
      )}
    </AnimatePresence>
  )
}
