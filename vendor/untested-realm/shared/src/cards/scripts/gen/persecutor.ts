import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { isEvilUnit } from '../../../engine/statics'
import { takeOwnStep } from '../../../engine/movement'
import { stepsTowardClosest } from '../multi-card-utils/own-step'
import type { GameState, UnitState } from '../../../engine/types'

const isEvilU = (state: GameState, u: UnitState) => isEvilUnit(state, u)

// 'Once on your turn, Persecutor may step toward the closest Evil, or brand an
//  enemy so your cards treat them as Evil this turn.'
// The brand does NOT change subtypes (it must NOT make the enemy a Monster, and must NOT break its Ward).
// It is a per-turn "treated as Evil" flag (flow.branded) that isEvilUnit() recognises for targeting/
// affecting Evil, while isEvilUnitIntrinsic() (ward-strip, "real Evil") ignores it.
// Codex (Closest): "imagine the Persecutor had unlimited movement … the 'closest' Evil is the unit that
// requires the fewest Persecutor steps to reach. (Your choice if tied.)" — measured in his own steps,
// and the step is his own (takeOwnStep), not a teleport.
const evilSteps = (state: GameState, self: UnitState) =>
  stepsTowardClosest(state, self, Object.values(state.units).filter((u) => !u.isAvatar && isEvilU(state, u)))
registerScript('Persecutor', {
  abilities: [{
    key: 'zeal',
    label: 'Step toward Evil, or brand an enemy',
    cost: {},
    oncePerTurn: true,
    deferUse: true, // the turn's use is spent only when a step or brand actually COMMITS — so you can
    // back out of the "step or brand / which way / which enemy" prompts freely until then.
    tentativePlay: true, // online: the whole flow is held privately and rolled back with no trace if you
    // go back (or it does nothing), exactly like Animist — so "↩ Go back" works across its prompts.
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'The Persecutor…', data: { options: ['steps toward the closest Evil', 'brands an enemy as Evil'] } }, 'zeal')
    },
  }],
  conts: {
    zeal: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof choice !== 'string') return
      if (choice.startsWith('steps')) {
        if (!Object.values(ctx.state.units).some((u) => !u.isAvatar && isEvilU(ctx.state, u))) return ctx.log('No Evil stalks the realm.')
        // every first step of a shortest route to ANY of the equally-closest Evils —
        // the player chooses the direction
        const steps = evilSteps(ctx.state, self)
        if (!steps.length) return ctx.log('No step brings the Persecutor closer.')
        if (steps.length === 1) {
          if (takeOwnStep(ctx.state, self, steps[0])) {
            self.usedThisTurn.zeal = 1 // committed → spend the once-per-turn use
            pushLog(ctx.state, ctx.controller, 'The Persecutor stalks toward the nearest Evil.')
          }
          return
        }
        ctx.ask({ kind: 'chooseSquare', title: 'The Persecutor stalks — which way?', data: { squares: steps.map((s) => ({ x: s.x, y: s.y })) } }, 'persecutorStep')
      } else {
        const enemies = Object.values(ctx.state.units).filter((u) => u.controller !== ctx.controller && !u.stealth).map((u) => u.id)
        if (!enemies.length) return
        ctx.ask({ kind: 'chooseTargets', title: 'Brand which enemy as Evil this turn?', data: { candidates: enemies, count: 1, upTo: false, kind: 'unit' } }, 'brand')
      }
    },
    brand: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.branded = { unitId: u.id, by: ctx.controller, turn: ctx.state.turn }
      const self = ctx.state.units[ctx.sourceId]
      if (self) self.usedThisTurn.zeal = 1 // committed → spend the once-per-turn use
      pushLog(ctx.state, ctx.controller, `${u.name} is branded a heretic — Evil in the Persecutor's eyes.`)
    },
    persecutorStep: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      const step = self && sq ? evilSteps(ctx.state, self).find((s) => s.x === sq.x && s.y === sq.y) : undefined
      if (self && step && takeOwnStep(ctx.state, self, step)) {
        self.usedThisTurn.zeal = 1 // committed → spend the once-per-turn use
        pushLog(ctx.state, ctx.controller, 'The Persecutor stalks toward the nearest Evil.')
      }
    },
  },
})
