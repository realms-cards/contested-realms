import { registerScript } from '../registry'

// "Bearer has +3 power, but it can't drop this Weapon and its controller loses 2
// life at the end of their turn."
registerScript('Blade of Thorns', {
  bearerPower: 3,
  cantDrop: true,
  endOfTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (art?.carriedBy) ctx.loseLife(ctx.controller, 2)
  },
})
