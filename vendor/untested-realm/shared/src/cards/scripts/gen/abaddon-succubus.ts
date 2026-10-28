import { registerScript } from '../registry'
import { selfStepsCloser, takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'

// 'Once on your turn, may lure target adjacent enemy minion to take a step
// closer. When it arrives, it takes 2 damage and you heal 2.'
registerScript('Abaddon Succubus', {
  abilities: [{
    key: 'lure',
    label: 'Lure an adjacent enemy closer',
    cost: {},
    oncePerTurn: true,
    targets: [{ what: 'minion', count: 1, targeted: true, where: 'adjacent', owner: 'enemy', label: 'target adjacent enemy minion' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (!u) return
      // FAQ: a target already sharing the Succubus's location has "arrived"
      if (u.x === self.x && u.y === self.y) {
        ctx.dealDamage({ unit: u.id }, 2)
        ctx.gainLife(ctx.controller, 2)
        checkStateBased(ctx.state)
        return
      }
      const options = selfStepsCloser(ctx.state, u, self) // "take a step closer" (def. 2)
      if (options.length === 0) return
      if (options.length === 1) {
        // "When it arrives": nothing happens to one that didn't (Old Salt Anchorman held it back)
        if (takeOwnStep(ctx.state, u, options[0], ctx.controller) && ctx.state.units[u.id]) {
          ctx.dealDamage({ unit: u.id }, 2)
          ctx.gainLife(ctx.controller, 2)
        }
        checkStateBased(ctx.state)
        return
      }
      // several legal closer steps → the EFFECT's controller chooses (Coy Nixie rule)
      ctx.ask({ kind: 'chooseSquare', title: `Abaddon Succubus — step ${u.name} closer (choose a direction)`, data: { squares: options.map((s) => ({ x: s.x, y: s.y })) }, player: ctx.controller }, 'succStep', { victim: u.id, gainer: ctx.controller })
    },
  }],
  conts: {
    succStep: (ctx, c: any, choice: any) => {
      const u = ctx.state.units[c.victim as string]
      const self = ctx.state.units[ctx.sourceId]
      if (!u || !self || !choice || typeof choice.x !== 'number') return
      const step = selfStepsCloser(ctx.state, u, self).find((s) => s.x === choice.x && s.y === choice.y)
      if (step && takeOwnStep(ctx.state, u, step, ctx.controller) && ctx.state.units[u.id]) {
        ctx.dealDamage({ unit: u.id }, 2)
        ctx.gainLife(c.gainer, 2)
      }
      checkStateBased(ctx.state)
    },
  },
})
