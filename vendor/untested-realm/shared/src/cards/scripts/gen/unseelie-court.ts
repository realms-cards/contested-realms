import { registerScript, type EffectAPI } from '../registry'
import { opponent, discardableHandIds, toCemetery } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'At the start of your turn, players discard a spell for each Faerie in the realm.'
registerScript('Unseelie Court', {
  startOfTurn: (ctx) => {
    const n = Object.values(ctx.state.units).filter((u) => !u.isAvatar && effSubtypes(ctx.state, u).includes('Faerie')).length
    if (!n) return
    unseeliePick(ctx, ctx.controller, n, true)
  },
  conts: {
    // id-based: `choice` indexes the candidate spell list captured at ask time.
    tithe: (ctx, c, choice) => {
      const idxs = (Array.isArray(choice) ? choice : []).filter((i): i is number => typeof i === 'number')
      const who = c.who as PlayerId
      const p = ctx.state.players[who]
      const ids = (c.spellIds as string[]) ?? []
      for (const i of idxs) {
        const id = ids[i]
        if (typeof id === 'string' && p.hand.includes(id)) {
          p.hand.splice(p.hand.indexOf(id), 1)
          toCemetery(ctx.state, id)
        }
      }
      if (c.thenOpp) unseeliePick(ctx, opponent(ctx.controller), c.n as number, false)
    },
  },
})

function unseeliePick(ctx: EffectAPI, who: PlayerId, n: number, thenOpp: boolean): void {
  // "discard a spell for each Faerie" — sites are never eligible.
  const spells = discardableHandIds(ctx.state, who, true) // never Morgana's/Omphalos's locked spells
  const count = Math.min(n, spells.length)
  if (!count) {
    if (thenOpp) unseeliePick(ctx, opponent(ctx.controller), n, false)
    return
  }
  ctx.ask(
    { kind: 'chooseCards', title: `Unseelie Court: discard ${count} spell(s).`, data: { cards: spells.map((id) => ctx.state.cards[id].name), pick: count, upTo: false }, player: who },
    'tithe',
    { who, n, thenOpp, spellIds: spells },
  )
}
