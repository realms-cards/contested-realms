import { registerScript } from '../registry'
import { getCard } from '../../db'
import { toCemetery } from '../../../engine/effects'
import { collectionNames, takeFromCollection, payZoneToll } from '../../../engine/statics'
import { affordable, effectCastSpell } from '../../../engine/casting'

// 'Sacrifice → Bearer may cast an Ordinary spell from your collection.'
registerScript('Toolbox', {
  abilities: [{
    key: 'rummage',
    label: 'Sacrifice → fetch an Ordinary spell from your collection',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!bearer) return ctx.log('The toolbox needs a bearer to wield it.')
      const names = collectionNames(ctx.state, ctx.controller).filter((n) => {
        const d = getCard(n)
        if (d.rarity !== 'Ordinary' || d.type === 'Site' || d.type === 'Avatar') return false
        return affordable(ctx.state, ctx.controller, n, bearer)
      })
      if (!names.length) return ctx.log('No Ordinary spell in your collection you can pay for right now.')
      ctx.ask({ kind: 'nameCard', title: 'Rummage for which Ordinary spell?', data: { names, fromCollection: true } }, 'rummage')
    },
  }],
  conts: {
    rummage: (ctx, _c, name) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer || typeof name !== 'string') return
      const def = getCard(name)
      if (def.rarity !== 'Ordinary' || def.type === 'Site' || def.type === 'Avatar') return
      if ((ctx.state.players[ctx.controller].collection[name] ?? 0) <= 0) return // must own it
      if (!affordable(ctx.state, ctx.controller, name, bearer)) return // must be payable
      // reaching into your collection is tolled by the Bureau of Occult Control — pay (2) first (abort if you can't)
      if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for collection access.')
      // the toolbox is spent
      bearer.carrying = bearer.carrying.filter((id) => id !== art.id)
      const card = ctx.state.cards[art.cardId]
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.artifacts[art.id]
      takeFromCollection(ctx.state, ctx.controller, name)
      // CAST it for real (prompts for its own targets), paying its cost — the
      // bearer casts it even if it isn't a Spellcaster. Never a token in hand.
      effectCastSpell(ctx.state, ctx.controller, name, { free: false, caster: bearer.id, grantsCasting: true })
    },
  },
})
