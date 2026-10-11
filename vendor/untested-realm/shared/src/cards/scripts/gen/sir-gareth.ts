import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effSubtypes, isUnmodifiable } from '../../../engine/statics'

// '(A)(W) — Reveal from hand → Transform an allied Mortal into Sir Gareth.'
registerScript('Sir Gareth', {
  handAbilities: (state, cardId, owner) => [{
    key: `gareth:${cardId}`,
    label: 'Reveal → a Mortal ally becomes Sir Gareth',
    cost: {},
    threshold: { air: 1, water: 1 },
    effect: (ctx) => {
      const mortals = Object.values(ctx.state.units)
        .filter((u) => u.controller === ctx.controller && !u.isAvatar && effSubtypes(ctx.state, u).includes('Mortal'))
        .map((u) => u.id)
      if (!mortals.length) return ctx.log('No allied Mortal to unmask.')
      ctx.ask({ kind: 'chooseTargets', title: 'Which Mortal was Gareth in disguise?', data: { candidates: mortals, count: 1, upTo: false, kind: 'unit' } }, 'unmask', { cardId })
    },
  }],
  conts: {
    unmask: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      if (!u || !p.hand.includes(cardId)) return
      if (isUnmodifiable(ctx.state, u)) return ctx.log("That minion can't be modified.")
      p.hand.splice(p.hand.indexOf(cardId), 1)
      u.name = 'Sir Gareth'
      u.cardId = cardId
      u.damage = 0
      pushLog(ctx.state, ctx.controller, 'The humble servant throws off his rags — Sir Gareth stands revealed!')
    },
  },
})
