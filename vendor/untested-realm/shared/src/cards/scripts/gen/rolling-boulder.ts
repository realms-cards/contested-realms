import { registerScript } from '../registry'
import { rollBoulder } from '../multi-card-utils/rolling-boulder'

// 'Units here have "Tap → Give Rolling Boulder a push. It rolls as far as
//  possible and deals 4 damage to each other unit along its path."'
registerScript('Rolling Boulder', {
  artifactGrantsAbilities: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    // "Units here" = wherever the Boulder sits — including when it's being carried,
    // in which case its location is the carrier's, so units there (the carrier and
    // any others) can still push it.
    if (!art || unit.x !== art.x || unit.y !== art.y || unit.region !== art.region) return []
    return [{
      key: 'boulder:push',
      label: 'Push the Rolling Boulder',
      cost: { tap: true },
      effect: (ctx) => {
        ctx.ask({ kind: 'chooseOption', title: 'Push the Boulder which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'roll', { artId: artifactId })
      },
      // the granted ability's asks resolve on this (the granting) script's conts (AbilityDef.contOwner)
    }]
  },
  conts: {
    roll: (ctx, c, dir) => {
      const pusher = ctx.state.units[ctx.sourceId]
      if (!pusher || typeof dir !== 'string') return
      // the Boulder that granted the push — carried or not (a carried Boulder sits at its carrier's location)
      const shares = (a: { x: number; y: number; region: string }) => a.x === pusher.x && a.y === pusher.y && a.region === pusher.region
      const byId = typeof c?.artId === 'string' ? ctx.state.artifacts[c.artId] : undefined
      const art = byId ?? Object.values(ctx.state.artifacts).find((a) => a.name === 'Rolling Boulder' && shares(a))
      if (!art || !shares(art)) return
      rollBoulder(ctx, art, dir, ctx.sourceId)
    },
  },
})
