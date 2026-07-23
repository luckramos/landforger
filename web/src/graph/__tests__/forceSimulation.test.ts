import { describe, expect, it } from 'vitest'
import type { RelationshipGraph } from '../graphModel'
import { createForceSimulation } from '../forceSimulation'

function syntheticGraph(count: number): RelationshipGraph {
  return {
    nodes: Array.from({ length: count }, (_, index) => ({
      slug: `node-${index}`,
      title: `Node ${index}`,
      category: 'stories' as const,
      degree: index === 0 ? count - 1 : 1,
    })),
    edges: Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
      key: `node-0--node-${index + 1}`,
      sourceSlug: 'node-0',
      targetSlug: `node-${index + 1}`,
      kinds: ['body'] as const,
    })),
  }
}

describe('force simulation', () => {
  it('seeds global nodes by degree on a deterministic phyllotaxis spiral', () => {
    const simulation = createForceSimulation(syntheticGraph(3), { width: 800, height: 600, scope: 'global' })

    expect(simulation.positions().map(({ slug }) => slug)).toEqual(['node-0', 'node-1', 'node-2'])
    expect(simulation.position('node-0')).toMatchObject({ x: 468.2, y: 300 })
  })

  it('pins the local focal node in the center and seeds direct neighbors on a ring', () => {
    const graph = { ...syntheticGraph(4), focalSlug: 'node-0' }
    const simulation = createForceSimulation(graph, { width: 800, height: 600, scope: 'local' })

    expect(simulation.position('node-0')).toMatchObject({ x: 400, y: 300 })
    expect(simulation.position('node-1')).toMatchObject({ x: 570, y: 300 })
    simulation.tick()
    expect(simulation.position('node-0')).toMatchObject({ x: 400, y: 300 })
  })

  it('lets a dragged node drive live physics, then resumes it on release', () => {
    const simulation = createForceSimulation(syntheticGraph(3), { width: 800, height: 600, scope: 'global' })
    simulation.beginDrag('node-1')
    simulation.dragTo(120, 140)
    simulation.tick()
    expect(simulation.position('node-1')).toMatchObject({ x: 120, y: 140, vx: 0, vy: 0 })

    simulation.endDrag()
    simulation.tick()
    expect(simulation.position('node-1')).not.toMatchObject({ x: 120, y: 140 })
  })

  it('keeps unrevealed nodes out of physics until they become active', () => {
    const simulation = createForceSimulation(syntheticGraph(3), { width: 800, height: 600, scope: 'global' })
    const hiddenBefore = simulation.positions().slice(1).map(({ x, y }) => ({ x, y }))

    const firstFrame = simulation.tick(1)

    expect(firstFrame.repulsionChecks).toBe(0)
    expect(simulation.positions().slice(1)).toMatchObject(hiddenBefore)
    expect(simulation.tick(3).repulsionChecks).toBe(3)
  })

  it('bounds pairwise repulsion work above the 300-node full-fidelity budget', () => {
    const graph = { ...syntheticGraph(900), edges: [] }
    const simulation = createForceSimulation(graph, { width: 1600, height: 1000, scope: 'global' })
    for (const position of simulation.positions()) {
      position.x = 800
      position.y = 500
    }
    const frame = simulation.tick()

    expect(frame.repulsionChecks).toBeLessThanOrEqual((300 * 299) / 2)
    expect(frame.kineticEnergy).toBeGreaterThanOrEqual(0)
    expect(simulation.positions().every(({ vx, vy }) => vx !== 0 || vy !== 0)).toBe(true)
  })

  it('keeps the 300-node operation budget stable across a sustained 60-frame run', () => {
    const simulation = createForceSimulation(syntheticGraph(300), { width: 1600, height: 1000, scope: 'global' })
    const frames = Array.from({ length: 60 }, () => simulation.tick())

    expect(frames.every((frame) => frame.repulsionChecks === (300 * 299) / 2)).toBe(true)
    expect(simulation.positions().every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  })
})
