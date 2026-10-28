import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import { adjacentSquaresW, siteAt, unitsAt } from '../../../engine/grid'
import { selfStepsCloser, takeOwnStep } from '../../../engine/movement'

// 'At the start of your turn, if Unland Angler is submerged, force each enemy
//  minion atop adjacent sites to take a step toward this one.'
// The EFFECT's controller (the Angler's) picks the direction on ties — the general forced-"take a step"
// agency rule (FAQ: Crave Golem "controller's choice if tied"), matching Coy Nixie / Guile Sirens / etc.
registerScript('Unland Angler', {
  startOfTurn: (ctx) => anglerNext(ctx, []),
  conts: {
    lure: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      const self = ctx.state.units[ctx.sourceId]
      const step = u && self && sq ? selfStepsCloser(ctx.state, u, self).find((s) => s.x === sq.x && s.y === sq.y) : undefined
      if (u && step) takeOwnStep(ctx.state, u, step, ctx.controller)
      anglerNext(ctx, [...(c.done as string[]), c.unitId as string])
    },
  },
})

function anglerNext(ctx: EffectAPI, done: string[]): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || self.region !== 'underwater') return
  const prey = adjacentSquaresW(ctx.state, self.x, self.y)
    .filter((s) => siteAt(ctx.state, s.x, s.y))
    .flatMap((s) => unitsAt(ctx.state, s.x, s.y, 'surface'))
    .find((u) => !u.isAvatar && u.controller !== ctx.controller && !done.includes(u.id))
  if (!prey) return
  const steps = selfStepsCloser(ctx.state, prey, self) // "take a step toward" (def. 2)
  if (!steps.length) return anglerNext(ctx, [...done, prey.id])
  if (steps.length === 1) {
    if (takeOwnStep(ctx.state, prey, steps[0], ctx.controller)) pushLog(ctx.state, ctx.controller, `${prey.name} is lured toward the Angler's light…`)
    return anglerNext(ctx, [...done, prey.id])
  }
  ctx.ask(
    { kind: 'chooseSquare', title: `${prey.name} is lured toward the Angler — which way does it stumble?`, data: { squares: steps.map((s) => ({ x: s.x, y: s.y })) }, player: ctx.controller },
    'lure',
    { unitId: prey.id, done },
  )
}
