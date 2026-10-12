import { pushLog, checkStateBased } from '../../../engine/effects'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

export function takeControl(state: GameState, unit: UnitState, player: PlayerId, revertAtEnd = false) {
  if (unit.controller === player) return
  unit.controller = player
  pushLog(state, player, `${state.players[player].name} gains control of ${unit.name}!`)
  if (revertAtEnd) {
    state.flow = state.flow ?? {}
    state.flow.controlReverts = [...(state.flow.controlReverts ?? []), { unitId: unit.id, to: (1 - player) as PlayerId }]
  }
  checkStateBased(state)
}
