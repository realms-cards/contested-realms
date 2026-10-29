import type { GameState, UnitState } from '../../../engine/types'
import { unitsAt } from '../../../engine/grid'
import { footprintAllTerrain } from '../../../engine/statics'
import { syncCarried, buryArtifactsAt } from '../../../engine/carrying'
import { trySubmerge } from '../../../engine/effects'

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

/**
 * Submerge everything occupying a square — the water twin of burrowOccupantsAt (Stormy Seas, Wrath
 * of the Sea, Atlantean Fate). Each surface minion goes through trySubmerge (footprint, "clings on"
 * protection, drowning) and takes its cargo down with it; EVERY artifact at the square is submerged —
 * loose ones AND ones carried by a unit that stayed up (an Avatar), detached and submerged on their own.
 * The caller checks the square is water and settles state (checkStateBased) afterwards.
 */
export function submergeOccupantsAt(state: GameState, x: number, y: number): void {
  for (const u of unitsAt(state, x, y, 'surface')) trySubmerge(state, u)
  buryArtifactsAt(state, x, y, 'underwater')
}
