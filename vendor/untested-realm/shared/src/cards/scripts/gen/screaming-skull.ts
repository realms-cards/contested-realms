import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Whenever bearer attacks and kills an enemy, it untaps.'
registerScript('Screaming Skull', {
  onAttackKill: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
    if (bearer) {
      bearer.tapped = false
      pushLog(ctx.state, ctx.controller, `The Screaming Skull howls — ${bearer.name} fights on!`)
    }
  },
})
