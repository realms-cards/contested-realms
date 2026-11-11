import { registerScript } from '../registry'
import { pushLog, discardableHandIds, toCemetery } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'
import { takeControl } from '../multi-card-utils/take-control'

// 'Avatars nearby have "Discard a card → Gain control of Seasoned Sellsword."'
registerScript('Seasoned Sellsword', {
  grantsAbilities: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || !unit.isAvatar) return []
    if (!nearbySquaresW(state, self.x, self.y).some((s) => s.x === unit.x && s.y === unit.y)) return []
    if (unit.controller === self.controller) return []
    return [{
      key: 'sellsword:hire',
      label: 'Discard a card → Hire the Seasoned Sellsword',
      // the discard is the COST (paid in the prompt below); `discardSpell` only tells the bots so
      cost: { discardSpell: true },
      available: (st) => discardableHandIds(st, unit.controller).length > 0, // nothing to pay with → no ability
      contOwner: 'Seasoned Sellsword',
      effect: (ctx) => {
        const ids = discardableHandIds(ctx.state, ctx.controller) // a caster-locked card isn't yours to discard
        if (!ids.length) return ctx.log('You have no card to pay the Sellsword with.')
        ctx.ask({ kind: 'chooseCards', title: 'Discard which card to hire the Sellsword?', data: { cards: ids.map((i) => ctx.state.cards[i].name), pick: 1, upTo: false } }, 'hire', { ids, swordId: selfId })
      },
    }]
  },
  conts: {
    hire: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const id = typeof idx === 'number' ? (c.ids as string[])[idx] : undefined
      const hand = ctx.state.players[ctx.controller].hand
      if (!id || !hand.includes(id)) return
      hand.splice(hand.indexOf(id), 1)
      toCemetery(ctx.state, id)
      pushLog(ctx.state, ctx.controller, `${ctx.state.players[ctx.controller].name} discards ${ctx.state.cards[id].name}.`)
      const sword = ctx.state.units[c.swordId as string] // THIS Sellsword (granted the ability), not whichever copy is first
      if (sword && sword.controller !== ctx.controller && takeControl(ctx.state, sword, ctx.controller)) {
        pushLog(ctx.state, ctx.controller, 'The Sellsword follows the coin.')
      }
    },
  },
})
