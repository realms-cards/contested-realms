import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { collectionBanned, takeFromCollection, isUnmodifiable } from '../../../engine/statics'

// '(W)(W)(W)(W) → Transform a minion here into a Horrible Hybrids from your collection.'
registerScript('Gilman House', {
  abilities: [{
    key: 'initiation',
    label: 'Transform a minion here into Horrible Hybrids',
    cost: {},
    threshold: { water: 4 },
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      const guests = unitsAt(ctx.state, self.x, self.y).filter((u) => !u.isAvatar).map((u) => u.id)
      if (!guests.length) return ctx.log('No guest to initiate.')
      ctx.ask({ kind: 'chooseTargets', title: 'Who joins the Esoteric Order?', data: { candidates: guests, count: 1, upTo: false, kind: 'unit' } }, 'initiate')
    },
  }],
  conts: {
    initiate: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      if (isUnmodifiable(ctx.state, u)) return ctx.log("That minion can't be modified.")
      // the new form comes "from your collection" — you must own a Horrible Hybrids
      if ((ctx.state.players[ctx.controller].collection?.['Horrible Hybrids'] ?? 0) <= 0) {
        return ctx.log('No Horrible Hybrids in your collection.')
      }
      if (collectionBanned(ctx.state, ctx.controller, 'Horrible Hybrids')) {
        return pushLog(ctx.state, ctx.controller, 'Every Horrible Hybrids in the collection was banished by the Legion of Gall.')
      }
      takeFromCollection(ctx.state, ctx.controller, 'Horrible Hybrids')
      const cardId = `c${ctx.state.nextId++}`
      ctx.state.cards[cardId] = { id: cardId, name: 'Horrible Hybrids', owner: u.owner }
      const old = ctx.state.cards[u.cardId]
      if (old && !old.isToken) ctx.state.players[old.owner].banished.push(old.id)
      u.name = 'Horrible Hybrids'
      u.cardId = cardId
      u.damage = 0
      pushLog(ctx.state, ctx.controller, 'The change is complete — another Horrible Hybrid shambles out.')
    },
  },
})
