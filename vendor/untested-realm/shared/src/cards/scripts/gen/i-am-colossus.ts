import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'You may banish minions under your control, or from your hand or cemetery,
//  to help cast the Colossus. It costs (1) less to cast for each.'
registerScript('I Am Colossus!', {
  selfCostModifier: (state, player) => -(state.flow?.colossusCredits?.[player] ?? 0),
  handAbilities: (state, cardId, owner) => [{
    key: `colossus:${cardId}`,
    label: 'Feed the Colossus (banish a minion → −① to cast)',
    cost: {},
    effect: (ctx) => {
      const units = Object.values(ctx.state.units)
        .filter((u) => u.controller === ctx.controller && !u.isAvatar)
        .map((u) => u.id)
      const p = ctx.state.players[ctx.controller]
      const cards = [...p.hand, ...p.cemetery].filter((id) => id !== cardId && getCard(ctx.state.cards[id].name).type === 'Minion')
      if (!units.length && !cards.length) return ctx.log('Nothing left to feed it.')
      const options = [
        ...(units.length ? ['banish a minion in play'] : []),
        ...(cards.length ? ['banish one from hand/cemetery'] : []),
      ]
      ctx.ask({ kind: 'chooseOption', title: 'Feed the Colossus with…', data: { options } }, 'feed', { units, cards })
    },
  }],
  conts: {
    feed: (ctx, c, choice) => {
      if (choice === 'banish a minion in play') {
        ctx.ask({ kind: 'chooseTargets', title: 'Which minion is consumed?', data: { candidates: c.units, count: 1, upTo: false, kind: 'unit' } }, 'consumeUnit')
      } else if (choice === 'banish one from hand/cemetery') {
        const cards = c.cards as string[]
        ctx.ask({ kind: 'chooseCards', title: 'Which card is consumed?', data: { cards: cards.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } }, 'consumeCard', { cards })
      }
    },
    consumeUnit: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      const card = ctx.state.cards[u.cardId]
      delete ctx.state.units[u.id]
      if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
      colossusCredit(ctx)
    },
    consumeCard: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const id = (c.cards as string[])[idx]
      const p = ctx.state.players[ctx.controller]
      for (const zone of [p.hand, p.cemetery]) {
        const at = zone.indexOf(id)
        if (at >= 0) {
          p.banished.push(zone.splice(at, 1)[0])
          colossusCredit(ctx)
          return
        }
      }
    },
  },
})

function colossusCredit(ctx: EffectAPI): void {
  ctx.state.flow = ctx.state.flow ?? {}
  ctx.state.flow.colossusCredits = ctx.state.flow.colossusCredits ?? { 0: 0, 1: 0 }
  ctx.state.flow.colossusCredits[ctx.controller] += 1
  pushLog(ctx.state, ctx.controller, `The Colossus grows (−${ctx.state.flow.colossusCredits[ctx.controller]} to cast).`)
}
