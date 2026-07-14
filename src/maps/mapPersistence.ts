import type { Dispatch, SetStateAction } from 'react'
import type { World } from '../domain/types'
import type { WorldRepository } from '../repository/WorldRepository'
import type { MapCollectionState } from './mapDomain'

/** Optimistically persists the Map/Pin aggregate and rolls the visible World back on failure. */
export async function persistMapCollection(
  repository: WorldRepository,
  currentWorld: World,
  state: MapCollectionState,
  setWorld: Dispatch<SetStateAction<World | undefined>>,
): Promise<void> {
  setWorld({ ...currentWorld, ...state })
  try {
    setWorld(await repository.updateWorld(currentWorld.slug, {
      maps: state.maps,
      pins: state.pins,
      rootMap: state.rootMap ?? null,
    }))
  } catch {
    setWorld(currentWorld)
  }
}
