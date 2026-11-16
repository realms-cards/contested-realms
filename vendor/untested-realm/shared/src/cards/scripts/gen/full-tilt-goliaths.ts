import { registerScript } from '../registry'
import { notifySiteInterference, siteCantBeModified } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { siteSilenced } from '../../../engine/statics'

// 'Charge / Genesis → Cover nearby sites with silencing snow until your next turn.' (Charge is a printed
// keyword.) The sites nearby when the Genesis resolves — the Goliaths' own site included — are silenced
// until the start of your next turn; the snow lies on those sites, so it stays put when the Goliaths move
// on (flow.siteSilences with a fixed siteIds list, expired by turn.ts like Leadworks' entry).
registerScript('Full-tilt Goliaths', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const near = nearbySquaresW(ctx.state, self.x, self.y)
      .map((q) => siteAt(ctx.state, q.x, q.y))
      .filter((s): s is NonNullable<typeof s> => !!s)
    if (!near.length) return
    // the sites THIS act silences: not already silent, and not one that can't be modified (Bedrock) — only
    // those are modified, so only those notify (a Vindictive Nation among them still triggers)
    const act = new Set(near.filter((s) => !siteSilenced(ctx.state, s) && !siteCantBeModified(ctx.state, s)).map((s) => s.id))
    const flow = (ctx.state.flow = ctx.state.flow ?? {})
    flow.siteSilences = [...(flow.siteSilences ?? []), { siteIds: near.map((s) => s.id), player: ctx.controller, turn: ctx.state.turn }]
    ctx.log(`Silencing snow covers ${near.length} site${near.length === 1 ? '' : 's'}.`)
    for (const s of near) if (act.has(s.id)) notifySiteInterference(ctx.state, 'modify', s, ctx.controller, act)
  },
})
