import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import type { GameState, PlayerId, Region } from '../../../engine/types'

// 'This costs (2) less to cast for each minion you sacrifice at its summoning location.'
// The sacrifice is part of the COST: the player picks which of their minions there to sacrifice (any number,
// none included) and the engine kills them with the mana payment, before the Wendigo enters — never a
// Genesis, so it still happens when the Wendigo enters disabled or silenced (castSacrificeCandidates).
function meals(state: GameState, player: PlayerId, at: { x: number; y: number; region?: Region }): string[] {
  return unitsAt(state, at.x, at.y, at.region ?? 'surface').filter((u) => u.controller === player && !u.isAvatar).map((u) => u.id)
}

registerScript('Gnarled Wendigo', {
  castSacrificeCandidates: meals,
  // the cast's own picks; with none named (the optimistic affordability check, a bot's cast) every candidate
  selfCostModifier: (state, player, at, extra) => {
    if (!at) return 0
    const picks: unknown = extra?.sacrifice
    return -2 * (Array.isArray(picks) ? picks.length : meals(state, player, at).length)
  },
})
