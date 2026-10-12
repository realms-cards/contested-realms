import { registerScript } from '../registry'
import { getCard } from '../../db'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'

// 'Each differently named Undead and Instrument nearby joins the band to play.
// Draw a card for each.'
registerScript('Necronomiconcert', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    const names = new Set<string>()
    for (const sq of nearbySquaresW(ctx.state, caster.x, caster.y)) {
      // nearby minion is region-locked to the source
      for (const u of unitsAt(ctx.state, sq.x, sq.y, caster.region)) {
        if (hasSubtype(ctx.state, u, 'Undead')) names.add(u.name)
      }
      for (const a of Object.values(ctx.state.artifacts)) {
        if (a.x === sq.x && a.y === sq.y && getCard(a.name).subtypes.includes('Instruments')) names.add(a.name)
      }
    }
    if (names.size > 0) {
      pushLog(ctx.state, ctx.controller, `The band plays: ${[...names].join(', ')}!`)
      ctx.drawCard(ctx.controller, names.size)
    }
  },
})
