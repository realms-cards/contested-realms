import { registerScript, getScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { collectionNames, takeFromCollection } from '../../../engine/statics'

// 'You can play an Exceptional site from your collection here, banishing this site.'
registerScript('Ersatz Platz', {
  abilities: [{
    key: 'replace',
    label: 'Swap for an Exceptional site from your collection',
    cost: {},
    effect: (ctx) => {
      const names = collectionNames(ctx.state, ctx.controller).filter((n) => {
        const d = getCard(n)
        return d.type === 'Site' && d.rarity === 'Exceptional'
      })
      ctx.ask({ kind: 'nameCard', title: 'Which Exceptional site takes its place?', data: { names, fromCollection: true } }, 'swap')
    },
  }],
  conts: {
    swap: (ctx, _c, name) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self || typeof name !== 'string') return
      const def = getCard(name)
      if (def.type !== 'Site' || def.rarity !== 'Exceptional') return
      if ((ctx.state.players[ctx.controller].collection[name] ?? 0) <= 0) return // must own it
      takeFromCollection(ctx.state, ctx.controller, name)
      const old = ctx.state.cards[self.cardId]
      if (old && !old.isToken) ctx.state.players[old.owner].banished.push(old.id)
      const cardId = `c${ctx.state.nextId++}`
      ctx.state.cards[cardId] = { id: cardId, name, owner: ctx.controller }
      self.name = name
      self.cardId = cardId
      pushLog(ctx.state, ctx.controller, `The Ersatz Platz is unmasked — it was ${name} all along.`)
      getScript(name)?.genesis?.(ctx)
    },
  },
})
