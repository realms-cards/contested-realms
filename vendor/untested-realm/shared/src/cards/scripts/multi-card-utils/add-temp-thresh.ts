import type { GameState, PlayerId, Thresholds } from '../../../engine/types'

export function addTempThresh(state: GameState, player: PlayerId, add: Partial<Thresholds>): void {
  state.flow = state.flow ?? {}
  state.flow.tempThresh = state.flow.tempThresh ?? {}
  const cur = state.flow.tempThresh[player] ?? { air: 0, earth: 0, fire: 0, water: 0 }
  state.flow.tempThresh[player] = {
    air: (cur.air ?? 0) + (add.air ?? 0),
    earth: (cur.earth ?? 0) + (add.earth ?? 0),
    fire: (cur.fire ?? 0) + (add.fire ?? 0),
    water: (cur.water ?? 0) + (add.water ?? 0),
  }
}
