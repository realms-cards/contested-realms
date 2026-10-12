import { effAttack, effDefence } from '../../../engine/statics'
import type { GameState, UnitState } from '../../../engine/types'

/** split-power average (round down) — "weaker/stronger" comparisons */
export const avgPow = (state: GameState, u: UnitState) => Math.floor((effAttack(state, u) + effDefence(state, u)) / 2)
