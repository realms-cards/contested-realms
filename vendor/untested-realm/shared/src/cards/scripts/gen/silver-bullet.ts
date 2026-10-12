import { registerScript } from '../registry'
import { getCard } from '../../db'
import { toCemetery } from '../../../engine/effects'
import { collectionNames, takeFromCollection, payZoneToll } from '../../../engine/statics'
import { affordable, effectCastSpell } from '../../../engine/casting'

// 'Bearer has "Tap, Sacrifice Silver Bullet → This unit may cast an Exceptional
//  spell from your collection."'
registerScript('Silver Bullet', {
  abilities: [{
    key: 'fire',
    label: 'Tap bearer, sacrifice → fetch an Exceptional spell',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!bearer || bearer.tapped) return ctx.log('The bearer must be ready to fire.')
      const names = collectionNames(ctx.state, ctx.controller).filter((n) => {
        const d = getCard(n)
        if (d.rarity !== 'Exceptional' || d.type === 'Site' || d.type === 'Avatar') return false
        return affordable(ctx.state, ctx.controller, n, bearer)
      })
      if (!names.length) return ctx.log('No Exceptional spell in your collection you can pay for right now.')
      ctx.ask({ kind: 'nameCard', title: 'The Silver Bullet becomes… which Exceptional spell?', data: { names, fromCollection: true } }, 'fire')
    },
  }],
  conts: {
    fire: (ctx, _c, name) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer || bearer.tapped || typeof name !== 'string') return
      const def = getCard(name)
      if (def.rarity !== 'Exceptional' || def.type === 'Site' || def.type === 'Avatar') return
      if ((ctx.state.players[ctx.controller].collection[name] ?? 0) <= 0) return // must own it
      if (!affordable(ctx.state, ctx.controller, name, bearer)) return // must be payable
      // reaching into your collection is tolled by the Bureau of Occult Control — pay (2) first (abort if unpaid)
      if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for collection access.')
      bearer.tapped = true
      bearer.carrying = bearer.carrying.filter((id) => id !== art.id)
      const card = ctx.state.cards[art.cardId]
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.artifacts[art.id]
      takeFromCollection(ctx.state, ctx.controller, name)
      // CAST it for real (prompts for targets), paying its cost, via the bearer
      effectCastSpell(ctx.state, ctx.controller, name, { free: false, caster: bearer.id, grantsCasting: true })
    },
  },
})
