import { registerScript } from '../registry'
import { getCard } from '../../db'
import type { PlayerId } from '../../../engine/types'
import { isEvilCardFor } from '../multi-card-utils/is-evil-card-for'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Airborne, Ward / Genesis → Players lose 1 life for each Evil minion they
// control or in their cemetery.'
registerScript('Archangel Samael', {
  genesis: (ctx) => {
    for (const pid of [0, 1] as PlayerId[]) {
      let n = 0
      for (const u of Object.values(ctx.state.units)) {
        if (u.controller === pid && !u.isAvatar && isEvilU(ctx.state, u)) n++
      }
      for (const id of ctx.state.players[pid].cemetery) {
        const def = getCard(ctx.state.cards[id].name)
        if (def.type === 'Minion' && isEvilCardFor(ctx.state, pid, ctx.state.cards[id].name)) n++
      }
      if (n > 0) ctx.loseLife(pid, n)
    }
  },
})
