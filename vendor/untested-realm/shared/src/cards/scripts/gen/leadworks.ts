import { registerScript } from '../registry'
import { pushLog, notifySiteInterference } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { siteSilenced } from '../../../engine/statics'

// 'Genesis → Until your next turn, sites are silenced while nearby.'
registerScript('Leadworks', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    const near = self
      ? nearbySquaresW(ctx.state, self.x, self.y)
        .map((q) => siteAt(ctx.state, q.x, q.y))
        .filter((s): s is NonNullable<typeof s> => !!s && s.id !== self.id && !s.isRubble)
      : []
    // the sites THIS act silences (not already silent): a Vindictive Nation among them still triggers on
    // it (Codex, Triggered Ability: "the act of removing a triggered ability … is still triggered")
    const act = new Set(near.filter((s) => !siteSilenced(ctx.state, s)).map((s) => s.id))
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.siteSilences = ctx.state.flow.siteSilences ?? []
    ctx.state.flow.siteSilences.push({ siteId: ctx.sourceId, player: ctx.controller, turn: ctx.state.turn })
    pushLog(ctx.state, ctx.controller, 'The Leadworks dampen all magic nearby — sites fall silent.')
    // the silenced neighbors count as modified (Vindictive Nation)
    for (const s of near) notifySiteInterference(ctx.state, 'modify', s, ctx.controller, act)
  },
})
