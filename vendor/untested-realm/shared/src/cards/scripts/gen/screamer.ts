import { registerScript } from '../registry'
import { selfStepsAway } from '../../../engine/movement'

// 'Genesis → Tap target adjacent enemy minion and make it take a step away.'
// When several steps-away are legal, the EFFECT's controller (you, the Screamer's caster) picks the
// direction — the general agency rule for a forced "take a step" (FAQ: Crave Golem "controller's choice
// if tied"), shared with Coy Nixie / Guile Sirens / Lure / Mesmer Demon / Abaddon Succubus.
registerScript('Screamer', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'adjacent', owner: 'enemy', label: 'target adjacent enemy minion',
  }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('unit' in t)) return
    const foe = ctx.state.units[t.unit]
    if (!foe) return
    foe.tapped = true
    const steps = selfStepsAway(ctx.state, foe, self) // "take a step away" (def. 2)
    if (!steps.length) return
    if (steps.length === 1) return ctx.teleport(foe.id, steps[0].x, steps[0].y, foe.region)
    ctx.ask({ kind: 'chooseSquare', title: `${foe.name} recoils from the Screamer — which way?`, data: { squares: steps }, player: ctx.controller }, 'flee', { unitId: foe.id })
  },
  conts: {
    flee: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq) ctx.teleport(u.id, sq.x, sq.y, u.region)
    },
  },
})
