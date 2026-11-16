import { registerScript } from '../registry'
import type { NonUnitShield } from '../../../engine/statics'

// 'Genesis → Until your next turn, nearby allies are Protected from all but units.'
// Codex, Protected from X: X can't target, damage, destroy, banish, modify or move the unit. "All but
// units" = every Magic, site, artifact and aura; minions and Avatars still can. FAQ: "an ongoing effect
// centered on the Hummocks" — whichever allies are nearby the Hummocks at any moment until your next turn
// are protected (an ally that walks in gains it, one that walks away loses it). flow.protectedFromNonUnits,
// read by statics.protectedFromNonUnits (targeting, damage, the effect API's kill/banish/move/modify, site
// abilities via protectedFromSites) and expired by turn.ts at the start of your next turn.
registerScript('Humming Hummocks', {
  genesis: (ctx) => {
    if (!ctx.state.sites[ctx.sourceId]) return
    const flow = (ctx.state.flow = ctx.state.flow ?? {})
    const shield: NonUnitShield = { siteId: ctx.sourceId, player: ctx.controller, turn: ctx.state.turn }
    flow.protectedFromNonUnits = [...(flow.protectedFromNonUnits ?? []), shield]
    ctx.log('The Hummocks hum: nearby allies are protected from all but units until your next turn.')
  },
})
