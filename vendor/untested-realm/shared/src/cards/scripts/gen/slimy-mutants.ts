import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effKeywords, isUnmodifiable } from '../../../engine/statics'

// '(3) → Transform an ally with Submerge into Slimy Mutants from your hand.'
registerScript('Slimy Mutants', {
  handAbilities: (state, cardId, owner) => [{
    key: `slime:${cardId}`,
    label: '③ → A submerging ally mutates into Slimy Mutants',
    cost: { mana: 3 },
    effect: (ctx) => {
      const swimmers = Object.values(ctx.state.units)
        .filter((u) => u.controller === ctx.controller && !u.isAvatar && effKeywords(ctx.state, u).submerge)
        .map((u) => u.id)
      if (!swimmers.length) return ctx.log('No submerging ally to mutate.')
      ctx.ask({ kind: 'chooseTargets', title: 'Which ally sloughs into slime?', data: { candidates: swimmers, count: 1, upTo: false, kind: 'unit' } }, 'mutate', { cardId })
    },
  }],
  conts: {
    mutate: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      if (!u || !p.hand.includes(cardId)) return
      if (isUnmodifiable(ctx.state, u)) return ctx.log("That minion can't be modified.")
      p.hand.splice(p.hand.indexOf(cardId), 1)
      u.name = 'Slimy Mutants'
      u.cardId = cardId
      u.damage = 0
      pushLog(ctx.state, ctx.controller, 'Flesh runs like wax — the Slimy Mutants emerge.')
    },
  },
})
