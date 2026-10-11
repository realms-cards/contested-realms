import { registerScript } from '../registry'
import { getCard } from '../../db'
import { canTap } from '../../../engine/statics'
import { revealCards } from '../../../engine/effects'

// "Bearer has 'Tap → Reveal your topmost spell and draw it. Bearer takes damage equal to that card's cost.'"
registerScript('Pnakotic Manuscript', {
  abilities: [{
    key: 'forbiddenLore',
    label: "Tap bearer → Reveal your topmost spell and draw it; bearer takes damage equal to its cost",
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : undefined
      if (!bearer) return ctx.log('No one is carrying Pnakotic Manuscript.')
      if (!canTap(ctx.state, bearer)) return ctx.log(`${bearer.name} cannot tap.`)
      ctx.tap(bearer.id)
      const p = ctx.state.players[ctx.controller]
      const topId = p.spellbook[0]
      if (topId === undefined) {
        // drawing from an empty spellbook loses the game
        ctx.draw(ctx.controller, 'spellbook')
        return
      }
      const name = ctx.state.cards[topId].name
      ctx.log(`Pnakotic Manuscript reveals ${name}.`)
      revealCards(ctx.state, ctx.controller, [name]) // drawn to hand, never summoned → reveal it to the opponent
      ctx.draw(ctx.controller, 'spellbook')
      ctx.dealDamage({ unit: bearer.id }, getCard(name).cost ?? 0)
    },
  }],
})
