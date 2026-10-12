import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Genesis → Banish all dead minions, and you heal 1 life for each.'
registerScript('Pillar of Zeiros', {
  genesis: (ctx) => {
    let n = 0
    for (const p of ctx.state.players) {
      const dead = p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion')
      if (dead.length === 0) continue
      p.cemetery = p.cemetery.filter((id) => !dead.includes(id))
      p.banished.push(...dead)
      n += dead.length
    }
    ctx.log(`Pillar of Zeiros banishes ${n} dead minion${n === 1 ? '' : 's'}.`)
    if (n > 0) ctx.gainLife(ctx.controller, n)
  },
})
