import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { GameState } from '../../../engine/types'

// 'Players can't control cards owned by other players.' (King Arthur — a
// continuous sweep returning stolen cards)
registerScript('King Arthur', {
  startOfTurn: (ctx) => arthurSweep(ctx.state),
  endOfEveryTurn: (ctx) => arthurSweep(ctx.state),
  onUnitEnters: (ctx) => arthurSweep(ctx.state),
})

function arthurSweep(state: GameState) {
  const arthurInPlay = Object.values(state.units).some((u) => u.name === 'King Arthur' && !u.silenced)
  if (!arthurInPlay) return
  for (const u of Object.values(state.units)) {
    if (!u.isAvatar && u.controller !== u.owner) {
      u.controller = u.owner
      pushLog(state, u.owner, `${u.name} returns to its rightful lord (King Arthur's law).`)
    }
  }
}
