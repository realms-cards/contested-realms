import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { selfStepsCloser, takeOwnStep } from '../../../engine/movement'
import { isAdjacentW } from '../../../engine/grid'
import { stepsTowardClosest } from '../multi-card-utils/own-step'
import type { Step } from '../../../engine/types'

// 'Whenever an enemy casts magic, Sturmgeist steps closer then strikes it if adjacent.'
// FAQ: "it" is the enemy that cast — "The Sturmgeist only hears spells cast by enemies, which are units"
// (an Avatar or a minion Spellcaster); "closer" = the location it could step to with its normal movement
// that is closest to the caster. Its own step (Codex, Step def. 2): Airborne, so possibly diagonal.
registerScript('Sturmgeist', {
  onSpellCast: (ctx, by, cardName, casterId) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || by === ctx.controller || getCard(cardName).type !== 'Magic') return
    const caster = casterId ? ctx.state.units[casterId] : undefined
    if (!caster || caster.controller === ctx.controller) return // cast by an artifact / site: not heard
    const steps = stepsCloser(ctx, caster.id)
    if (steps.length === 1) return sturmArrive(ctx, steps[0], caster.id)
    if (steps.length > 1) {
      ctx.ask({ kind: 'chooseSquare', title: 'The Sturmgeist howls closer — which way?', data: { squares: steps.map((s) => ({ x: s.x, y: s.y })) } }, 'stalk', { casterId: caster.id })
      return
    }
    sturmStrike(ctx, caster.id)
  },
  conts: {
    stalk: (ctx, c, sq) => {
      const casterId = c.casterId as string
      const step = sq ? stepsCloser(ctx, casterId).find((s) => s.x === sq.x && s.y === sq.y) : undefined
      if (step) sturmArrive(ctx, step, casterId)
      else sturmStrike(ctx, casterId)
    },
  },
})

/** the steps that bring it closest to the caster: on a shortest route of its own steps when it can reach
 *  the caster at all, else any step that is geometrically closer */
function stepsCloser(ctx: EffectAPI, casterId: string): Step[] {
  const self = ctx.state.units[ctx.sourceId]
  const caster = ctx.state.units[casterId]
  if (!self || !caster) return []
  if (self.x === caster.x && self.y === caster.y && self.region === caster.region) return []
  const route = stepsTowardClosest(ctx.state, self, [caster])
  return route.length ? route : selfStepsCloser(ctx.state, self, caster)
}

function sturmArrive(ctx: EffectAPI, step: Step, casterId: string): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  takeOwnStep(ctx.state, self, step)
  sturmStrike(ctx, casterId)
}

// strike the caster if it's now adjacent (its location or an orthogonal one, in its region)
function sturmStrike(ctx: EffectAPI, casterId: string): void {
  const self = ctx.state.units[ctx.sourceId]
  const prey = ctx.state.units[casterId]
  if (!self || !prey) return
  if (prey.region === self.region && isAdjacentW(ctx.state, self.x, self.y, prey.x, prey.y)) ctx.strike(self, { unit: prey.id })
}
