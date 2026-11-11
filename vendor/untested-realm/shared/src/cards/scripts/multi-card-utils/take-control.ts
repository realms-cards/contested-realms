import { pushLog, checkStateBased } from '../../../engine/effects'
import { abilitiesOff } from '../../../engine/statics'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

/** King Arthur in the realm: "Players can't control cards owned by other players." */
export function arthurForbids(state: GameState, unit: UnitState, player: PlayerId): boolean {
  return unit.owner !== player && Object.values(state.units).some((u) => u.name === 'King Arthur' && !abilitiesOff(state, u))
}

/** Every control change of a unit goes through here. Returns whether `player` now controls it. */
export function takeControl(state: GameState, unit: UnitState, player: PlayerId, revertAtEnd = false): boolean {
  if (unit.controller === player) return true
  // King Arthur: no control change to a card you don't own happens at all
  if (arthurForbids(state, unit, player)) {
    pushLog(state, player, `${unit.name} stays with its rightful lord (King Arthur's law).`)
    return false
  }
  unit.controller = player
  pushLog(state, player, `${state.players[player].name} gains control of ${unit.name}!`)
  if (revertAtEnd) {
    state.flow = state.flow ?? {}
    state.flow.controlReverts = [...(state.flow.controlReverts ?? []), { unitId: unit.id, to: (1 - player) as PlayerId }]
  }
  checkStateBased(state)
  return true
}
