import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'Genesis → If there are three or more dead minions, banish all cemeteries.'
registerScript('Plague Pits', {
  genesis: (ctx) => {
    let dead = 0
    for (const p of ctx.state.players) {
      dead += p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion').length
    }
    if (dead < 3) return
    for (const p of ctx.state.players) {
      p.banished.push(...p.cemetery)
      p.cemetery = []
    }
    pushLog(ctx.state, ctx.controller, 'The plague pits are sealed — every corpse is lost.')
  },
})
