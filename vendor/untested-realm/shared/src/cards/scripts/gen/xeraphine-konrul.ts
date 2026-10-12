import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'At the end of your turn, you may choose three of your dead minions. Banish
//  two to return the remaining one to hand.'
registerScript('Xeraphine Konrul', {
  turnTriggersFromCemetery: true, // its end-of-turn bargain touches only your cemetery → Vivien fires it from the grave
  endOfTurn: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const dead = p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion')
    if (dead.length < 3) return
    ctx.ask(
      { kind: 'chooseCards', title: 'Xeraphine: pick THREE dead minions — the first chosen returns, the rest burn. (skip for none)', data: { cards: dead.map((id) => ctx.state.cards[id].name), pick: 3, upTo: true } },
      'bargain',
      { dead },
    )
  },
  conts: {
    bargain: (ctx, c, choice) => {
      const idxs = (Array.isArray(choice) ? choice : []).filter((i): i is number => typeof i === 'number')
      if (idxs.length !== 3) return
      const dead = c.dead as string[]
      const p = ctx.state.players[ctx.controller]
      const [keep, ...burn] = idxs.map((i) => dead[i])
      for (const id of burn) {
        const at = p.cemetery.indexOf(id)
        if (at >= 0) p.banished.push(p.cemetery.splice(at, 1)[0])
      }
      const at = p.cemetery.indexOf(keep)
      if (at >= 0) {
        p.cemetery.splice(at, 1)
        p.hand.push(keep)
        pushLog(ctx.state, ctx.controller, `${ctx.state.cards[keep].name} is bought back from death.`)
      }
    },
  },
})
