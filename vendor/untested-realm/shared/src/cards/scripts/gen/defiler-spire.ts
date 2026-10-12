import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { isEvilUnit } from '../../../engine/statics'

// 'Sites occupied by Evil have "At the end of your turn, you lose 1 life."'
registerScript('Defiler Spire', {
  endOfEveryTurn: (ctx) => {
    const player = ctx.state.activePlayer
    const isEvilU = (u: (typeof ctx.state.units)[string]) => isEvilUnit(ctx.state, u)
    let drained = 0
    for (const site of Object.values(ctx.state.sites)) {
      if (site.controller !== player || site.isRubble) continue
      const occupied = Object.values(ctx.state.units).some(
        (u) => !u.isAvatar && u.x === site.x && u.y === site.y && u.region === 'surface' && isEvilU(u),
      )
      if (occupied) drained++
    }
    if (drained > 0) {
      ctx.loseLife(player, drained)
      pushLog(ctx.state, player, `The Defiler Spire drains ${drained} life from the corrupted land.`)
    }
  },
})
