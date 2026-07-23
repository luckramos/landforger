import type { RelationshipGraph } from './graphModel'

export interface SimulationPosition {
  slug: string
  x: number
  y: number
  vx: number
  vy: number
}

export interface SimulationFrame {
  kineticEnergy: number
  repulsionChecks: number
}

export interface ForceSimulation {
  positions(): readonly SimulationPosition[]
  position(slug: string): SimulationPosition | undefined
  tick(activeCount?: number): SimulationFrame
  beginDrag(slug: string): void
  dragTo(x: number, y: number): void
  endDrag(): void
  isDragging(): boolean
}

interface SimulationOptions {
  width: number
  height: number
  scope: 'global' | 'local'
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const REPULSION = 1350
const SPRING_STRENGTH = 0.015
const DAMPING = 0.82
const STEP = 0.32
const FULL_FIDELITY_LIMIT = 300

const round1 = (value: number) => Math.round(value * 10) / 10

/** Deterministic, mutable simulation kept completely outside React state. */
export function createForceSimulation(graph: RelationshipGraph, options: SimulationOptions): ForceSimulation {
  const centerX = options.width / 2
  const centerY = options.height / 2
  const ordered = options.scope === 'global'
    ? [...graph.nodes].sort((a, b) => b.degree - a.degree || a.slug.localeCompare(b.slug))
    : graph.nodes
  const focalIndex = ordered.findIndex((node) => node.slug === graph.focalSlug)
  const neighborCount = Math.max(1, ordered.length - 1)
  const ringRadius = neighborCount > 7 ? 210 : 170

  const state: SimulationPosition[] = ordered.map((node, index) => {
    if (options.scope === 'local') {
      if (index === focalIndex) return { slug: node.slug, x: centerX, y: centerY, vx: 0, vy: 0 }
      const ringIndex = index > focalIndex ? index - 1 : index
      const angle = (ringIndex / neighborCount) * Math.PI * 2
      return {
        slug: node.slug,
        x: round1(centerX + Math.cos(angle) * ringRadius),
        y: round1(centerY + Math.sin(angle) * ringRadius),
        vx: 0,
        vy: 0,
      }
    }
    const radius = 92 * Math.sqrt(index + 0.55)
    const angle = index * GOLDEN_ANGLE
    return {
      slug: node.slug,
      x: round1(centerX + Math.cos(angle) * radius),
      y: round1(centerY + Math.sin(angle) * radius),
      vx: 0,
      vy: 0,
    }
  })
  const indexBySlug = new Map(state.map((position, index) => [position.slug, index]))
  const springs = graph.edges.flatMap((edge) => {
    const source = indexBySlug.get(edge.sourceSlug)
    const target = indexBySlug.get(edge.targetSlug)
    return source === undefined || target === undefined ? [] : [[source, target] as const]
  })
  let dragged = -1
  let repulsionSample = 0

  const repel = (a: SimulationPosition, b: SimulationPosition, aIndex: number, bIndex: number) => {
    let dx = a.x - b.x
    let dy = a.y - b.y
    let distanceSquared = dx * dx + dy * dy
    if (distanceSquared < 1) {
      dx = ((aIndex * 17 + bIndex * 13) % 7) - 3
      dy = ((aIndex * 11 + bIndex * 19) % 7) - 3
      distanceSquared = Math.max(1, dx * dx + dy * dy)
    }
    const distance = Math.sqrt(distanceSquared)
    const force = REPULSION / distanceSquared
    const forceX = (dx / distance) * force
    const forceY = (dy / distance) * force
    a.vx += forceX
    a.vy += forceY
    b.vx -= forceX
    b.vy -= forceY
  }

  const tick = (activeCount = state.length): SimulationFrame => {
    const activeLength = Math.max(0, Math.min(state.length, activeCount))
    let repulsionChecks = 0
    if (activeLength <= FULL_FIDELITY_LIMIT) {
      for (let i = 0; i < activeLength; i += 1) {
        for (let j = i + 1; j < activeLength; j += 1) {
          repel(state[i], state[j], i, j)
          repulsionChecks += 1
        }
      }
    } else {
      // Sample rotating ring-distance bands so every node receives repulsion
      // every frame while the total work stays within the 300-node budget.
      const checkBudget = (FULL_FIDELITY_LIMIT * (FULL_FIDELITY_LIMIT - 1)) / 2
      const maxOffset = Math.floor((activeLength - 1) / 2)
      const offsetsPerFrame = Math.max(1, Math.min(maxOffset, Math.floor(checkBudget / activeLength)))
      const startOffset = (repulsionSample * offsetsPerFrame) % maxOffset
      for (let sampledOffset = 0; sampledOffset < offsetsPerFrame; sampledOffset += 1) {
        const offset = 1 + ((startOffset + sampledOffset) % maxOffset)
        for (let i = 0; i < activeLength; i += 1) {
          const j = (i + offset) % activeLength
          repel(state[i], state[j], i, j)
          repulsionChecks += 1
        }
      }
      repulsionSample += 1
    }

    const restLength = options.scope === 'local' ? 170 : 195
    for (const [sourceIndex, targetIndex] of springs) {
      if (sourceIndex >= activeLength || targetIndex >= activeLength) continue
      const source = state[sourceIndex]
      const target = state[targetIndex]
      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const force = (distance - restLength) * SPRING_STRENGTH
      const forceX = (dx / distance) * force
      const forceY = (dy / distance) * force
      source.vx += forceX
      source.vy += forceY
      target.vx -= forceX
      target.vy -= forceY
    }

    let kineticEnergy = 0
    for (let index = 0; index < activeLength; index += 1) {
      const node = state[index]
      if (index === dragged) {
        node.vx = 0
        node.vy = 0
        continue
      }
      if (options.scope === 'local' && index === focalIndex) {
        node.x = centerX
        node.y = centerY
        node.vx = 0
        node.vy = 0
        continue
      }
      node.vx += (centerX - node.x) * (options.scope === 'local' ? 0.006 : 0.008)
      node.vy += (centerY - node.y) * (options.scope === 'local' ? 0.006 : 0.008)
      node.vx *= DAMPING
      node.vy *= DAMPING
      node.x += node.vx * STEP
      node.y += node.vy * STEP
      kineticEnergy += node.vx * node.vx + node.vy * node.vy
    }
    return { kineticEnergy, repulsionChecks }
  }

  return {
    positions: () => state,
    position: (slug) => {
      const index = indexBySlug.get(slug)
      return index === undefined ? undefined : state[index]
    },
    tick,
    beginDrag: (slug) => {
      dragged = indexBySlug.get(slug) ?? -1
      if (dragged >= 0) state[dragged].vx = state[dragged].vy = 0
    },
    dragTo: (x, y) => {
      if (dragged < 0) return
      state[dragged].x = x
      state[dragged].y = y
      state[dragged].vx = 0
      state[dragged].vy = 0
    },
    endDrag: () => { dragged = -1 },
    isDragging: () => dragged >= 0,
  }
}
