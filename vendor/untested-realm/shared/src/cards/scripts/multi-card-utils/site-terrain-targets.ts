import { type TargetRef } from '../registry'
import { isWaterSite } from '../../../engine/grid'
import { getCard } from '../../db'
import type { GameState } from '../../../engine/types'

// Engine-authoritative legal-target sets for the terrain-gated site magics (CardScript.targetOptions),
// so the client glows exactly the right candidate sites with NO logic of its own — it just consumes
// this set. The same isWaterSite the spec filter uses, so engine validation and the glow never diverge.

/** every WATER site as a target set — "target water site" magics (Stormy Seas, Baptize, Call of the
 *  Sea, Dredge, Riptide). Honours flooding / drought / rubble / effect-granted water via isWaterSite. */
export function waterSiteTargets(state: GameState): TargetRef[] {
  return Object.values(state.sites).filter((s) => isWaterSite(state, s, getCard)).map((s) => ({ site: s.id }))
}

/** every LAND (non-water) site — "target land site" magics (Cave-In, Exhume). */
export function landSiteTargets(state: GameState): TargetRef[] {
  return Object.values(state.sites).filter((s) => !isWaterSite(state, s, getCard)).map((s) => ({ site: s.id }))
}
