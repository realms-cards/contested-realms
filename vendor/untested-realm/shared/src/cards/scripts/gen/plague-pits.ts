import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { payZoneToll } from '../../../engine/statics'

// 'Genesis → If there are three or more dead minions, banish all cemeteries.'
registerScript('Plague Pits', {
  genesis: (ctx) => {
    let dead = 0
    for (const p of ctx.state.players) {
      dead += p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion').length
    }
    if (dead < 3) return
    // counting is free; the banishing is cemetery access (Bureau of Occult Control)
    if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
    for (const p of ctx.state.players) {
      p.banished.push(...p.cemetery)
      p.cemetery = []
    }
    pushLog(ctx.state, ctx.controller, 'The plague pits are sealed — every corpse is lost.')
  },
})
