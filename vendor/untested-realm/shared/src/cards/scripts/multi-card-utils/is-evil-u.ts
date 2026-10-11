import { isEvilUnit } from '../../../engine/statics'
import type { GameState, UnitState } from '../../../engine/types'

// evil = Demon/Undead/Monster, honoring subtype overrides (Corruptor et al.)
// (state-aware: the Saint of Redemption redeems cards in every zone)
export const isEvilU = (state: GameState, u: UnitState) => isEvilUnit(state, u)
