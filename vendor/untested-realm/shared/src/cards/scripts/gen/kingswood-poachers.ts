import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'
import type { PlayerId } from '../../../engine/types'

// 'Stealth / Genesis → Search a spellbook for up to three Beasts, banish them, then shuffle.'
registerScript('Kingswood Poachers', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Poach whose spellbook?', data: { options: ['yours', "opponent's"] } }, 'poach')
  },
  conts: {
    poach: (ctx, _c, choice) => {
      const pid = (choice === 'yours' ? ctx.controller : 1 - ctx.controller) as PlayerId
      const p = ctx.state.players[pid]
      let taken = 0
      p.spellbook = p.spellbook.filter((id) => {
        if (taken >= 3) return true
        const def = getCard(ctx.state.cards[id].name)
        if (def.type === 'Minion' && def.subtypes.includes('Beast')) {
          p.banished.push(id)
          taken++
          return false
        }
        return true
      })
      ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
      pushLog(ctx.state, ctx.controller, `${taken} Beast(s) poached from ${p.name}'s spellbook.`)
    },
  },
})
