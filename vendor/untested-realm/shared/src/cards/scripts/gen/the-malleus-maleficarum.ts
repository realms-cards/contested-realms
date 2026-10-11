import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { collectionBanned, payZoneToll, collectionNames, takeFromCollection } from '../../../engine/statics'
import { affordable, effectCastSpell } from '../../../engine/casting'

// ---------------------------------------------------- The Malleus Maleficarum ----
// 'Once on your turn, bearer may cast a magic from your collection that targets
//  an enemy Spellcaster, or their location or site.'
registerScript('The Malleus Maleficarum', {
  abilities: [{
    key: 'malleus',
    label: 'Fetch a witch-hunting magic from your collection',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer) return ctx.log('The hammer needs a bearer.')
      // only magics actually in your collection that you can pay for right now
      const names = collectionNames(ctx.state, ctx.controller).filter((n) => {
        const d = getCard(n)
        if (d.type !== 'Magic' || collectionBanned(ctx.state, ctx.controller, n)) return false
        return affordable(ctx.state, ctx.controller, n, bearer)
      })
      if (!names.length) return ctx.log('No magic in your collection you can pay for right now.')
      // the Bureau's toll is only paid once there is something to fetch
      if (!payZoneToll(ctx.state, ctx.controller)) {
        return ctx.log('The Bureau of Occult Control demands (2) for collection access.')
      }
      ctx.ask({ kind: 'nameCard', title: 'The Malleus Maleficarum opens to which magic?', data: { names, fromCollection: true } }, 'hammer', { bearer: bearer.id })
    },
  }],
  conts: {
    hammer: (ctx, c, name) => {
      const bearer = ctx.state.units[c.bearer as string]
      if (!bearer || typeof name !== 'string') return
      if (getCard(name).type !== 'Magic') return
      if ((ctx.state.players[ctx.controller].collection[name] ?? 0) <= 0) return // must own it
      if (!affordable(ctx.state, ctx.controller, name, bearer)) return // must be payable
      takeFromCollection(ctx.state, ctx.controller, name)
      // CAST it for real (prompts for its target), paying its cost, via the bearer;
      // the malleusCast tag makes castSpell enforce that it aims at an enemy
      // Spellcaster, or their location or site. Never a token in hand.
      pushLog(ctx.state, ctx.controller, `The witch-hammer reveals ${name} — cast it against a Spellcaster.`)
      effectCastSpell(ctx.state, ctx.controller, name, { free: false, caster: bearer.id, grantsCasting: true, tag: 'malleusCast' })
    },
  },
})
