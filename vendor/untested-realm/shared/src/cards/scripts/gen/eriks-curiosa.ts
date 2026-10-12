import { registerScript } from '../registry'
import { pushLog, recordRip } from '../../../engine/effects'
import { collectionNames } from '../../../engine/statics'
import { curiosaDraw } from './special-helpers'

registerScript("Erik's Curiosa", {
  abilities: [{
    key: 'rip',
    label: 'Rip to pieces → Draw a card',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      // physically destroyed: functionally banished, never to the cemetery
      if (art.carriedBy) {
        const carrier = ctx.state.units[art.carriedBy]
        if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
      }
      const card = ctx.state.cards[art.cardId]
      if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
      delete ctx.state.artifacts[ctx.sourceId]
      pushLog(ctx.state, ctx.controller, `✂ ${ctx.state.players[ctx.controller].name} rips Erik's Curiosa to pieces!`)
      recordRip(ctx.state, "Erik's Curiosa", ctx.controller) // big both-player tear animation

      // "Draw a card from your collection." (the deck's collection pool now exists)
      const names = collectionNames(ctx.state, ctx.controller)
      if (!names.length) return void pushLog(ctx.state, ctx.controller, 'No cards left in your collection to draw.')
      if (names.length === 1) return curiosaDraw(ctx, names[0])
      // choose which — the collection is your own to see (opponent never learns the pick)
      ctx.ask({ kind: 'nameCard', title: 'Draw which card from your collection?', data: { names } }, 'curiosaDraw')
    },
  }],
  conts: {
    curiosaDraw: (ctx, _c, choice) => { if (typeof choice === 'string') curiosaDraw(ctx, choice) },
  },
})
