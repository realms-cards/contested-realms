import { registerScript } from '../registry'
import { selfStepsCloser, takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'

// 'Submerge / Once on your turn, Coy Nixie may force target nearby enemy to take
// a step towards her. Tap that enemy.'
registerScript('Coy Nixie', {
  abilities: [{
    key: 'beckon',
    label: 'Beckon a nearby enemy closer',
    cost: {},
    oncePerTurn: true,
    targets: [{ what: 'unit', count: 1, targeted: true, where: 'nearby', owner: 'enemy', label: 'target nearby enemy' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (!u) return
      u.tapped = true // "Tap that enemy" — happens whether or not a step is possible
      // "take a step towards her" is Sorcery step-definition 2 (the enemy moves
      // itself): Airborne may step diagonally, Immobile can't step, region rules
      // apply. A diagonally-adjacent grounded enemy therefore has TWO legal steps
      // closer (the two sides), not zero — the original chebyshev test found none.
      const options = selfStepsCloser(ctx.state, u, self)
      if (options.length === 0) { checkStateBased(ctx.state); return } // nowhere closer to go
      if (options.length === 1) {
        takeOwnStep(ctx.state, u, options[0], ctx.controller)
        checkStateBased(ctx.state)
        return
      }
      // AGENCY RULE: several legal steps get closer — the EFFECT's controller chooses which
      // (unless the card says otherwise); the enemy moves itself (step-definition 2), MUST pick one
      ctx.ask(
        { kind: 'chooseSquare', title: `Coy Nixie beckons — step ${u.name} closer (choose a direction)`, data: { squares: options.map((s) => ({ x: s.x, y: s.y })) }, player: ctx.controller },
        'step',
        { victim: u.id },
      )
    },
  }],
  conts: {
    step: (ctx, c: any, choice: any) => {
      const u = ctx.state.units[c.victim as string]
      const self = ctx.state.units[ctx.sourceId]
      if (!u || !self || !choice || typeof choice.x !== 'number') return
      const step = selfStepsCloser(ctx.state, u, self).find((s) => s.x === choice.x && s.y === choice.y)
      if (step) takeOwnStep(ctx.state, u, step, ctx.controller)
      checkStateBased(ctx.state)
    },
  },
})
