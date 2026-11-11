import { registerScript } from '../registry'

// 'Genesis → Damage dealt to nearby units is increased by 1 this turn.'
// An effect of this turn, created as the Hollow enters: it lasts the turn even if the site is silenced or
// destroyed later, and follows the Hollow if the site moves this turn (Polar Shift, Earthquake). Nearby its
// square (its own and the eight around it); applied in the damage pipeline's increase pass (effects.ts,
// flow.nearbyDamageBoosts).
registerScript('Smoldering Hollow', {
  genesis: (ctx) => {
    const site = ctx.state.sites[ctx.sourceId]
    if (!site) return
    ctx.state.flow = ctx.state.flow ?? {}
    const live = ((ctx.state.flow.nearbyDamageBoosts ?? []) as { turn: number }[]).filter((z) => z.turn === ctx.state.turn)
    ctx.state.flow.nearbyDamageBoosts = [...live, { siteId: site.id, x: site.x, y: site.y, amount: 1, turn: ctx.state.turn }]
    ctx.log('The ground smolders — nearby wounds burn hotter this turn.')
  },
})
