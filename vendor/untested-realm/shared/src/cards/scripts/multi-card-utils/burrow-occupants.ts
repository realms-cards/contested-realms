import type { GameState, UnitState } from '../../../engine/types'
import { unitsAt } from '../../../engine/grid'
import { footprintAllTerrain } from '../../../engine/statics'
import { syncCarried, buryArtifactsAt } from '../../../engine/carrying'

/**
 * Burrow everything occupying a square underground — the shared Cave-In / Sir Balin mechanic.
 * Every non-avatar minion whose WHOLE footprint is land is sunk to 'underground' (an oversized
 * unit straddling non-land squares can't be buried — rulebook) and drags its carried units along
 * (syncCarried). EVERY artifact at the square is buried via buryArtifactsAt — loose ones AND ones
 * carried by a unit that couldn't be buried (an Avatar, a straddling oversized unit, or a `skip`ped
 * minion), which are detached and buried too.
 *
 * Pass `skip` to leave specific minions on the surface (Sir Balin spares himself). This does NOT
 * guard against a flooded/void square — you can't burrow into water — so a caller burrowing into
 * ruins it just created (Sir Balin) must check `terrainAt === 'land'` first. The caller settles
 * state (checkStateBased) afterwards.
 */
export function burrowOccupantsAt(state: GameState, x: number, y: number, skip?: (u: UnitState) => boolean): void {
  for (const u of unitsAt(state, x, y, 'surface')) {
    if (u.isAvatar || skip?.(u)) continue
    if (footprintAllTerrain(state, u, 'land')) { u.region = 'underground'; syncCarried(state, u) }
  }
  buryArtifactsAt(state, x, y)
}
