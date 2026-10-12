import { registerScript, type EffectAPI } from '../registry'
import { inBounds, siteAt, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { checkStateBased, emitUnitMoved } from '../../../engine/effects'

// 'Genesis → Rolls forward two steps, striking another unit at each location it enters.'
registerScript('Hotwheel', {
  genesis: (ctx) => hotwheelRoll(ctx, 2),
  conts: {
    hotwheelPick: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (self && typeof id === 'string') ctx.strike(self, { unit: id })
      if (ctx.state.units[ctx.sourceId]) hotwheelRoll(ctx, c.stepsLeft as number)
      else checkStateBased(ctx.state)
    },
  },
})

// roll forward up to `steps` more locations, striking ONE unit at each entered
// location — the controller chooses which when several share the square.
function hotwheelRoll(ctx: EffectAPI, steps: number) {
  const dy = ctx.controller === 0 ? 1 : -1
  for (let i = 0; i < steps; i++) {
    const self = ctx.state.units[ctx.sourceId] // re-fetch: an enter-trigger below may have killed it
    if (!self) break
    const ny = self.y + dy
    const from = { x: self.x, y: self.y, region: self.region }
    // rolling forward is a STEP: stop if it can't be taken — off-board, into the void (no site), or blocked
    // by a wall / entry ban (Great Wall, Wall of Ice…) or Immobility. (isLegalStep covers inBounds + site.)
    if (!inBounds(self.x, ny) || !siteAt(ctx.state, self.x, ny) || !isLegalStep(ctx.state, self, from, { x: self.x, y: ny, region: self.region })) break
    self.y = ny
    // Fire the movement event so "a unit enters / leaves this location" triggers actually run —
    // Briar Patch thorns, Druid, Dark Alley, Root Spider, etc. This custom roll used to mutate y
    // directly and silently skip every onUnitEntersSquare trigger (the "greater issue").
    emitUnitMoved(ctx.state, self, from, 'forced')
    if (!ctx.state.units[ctx.sourceId]) return checkStateBased(ctx.state) // rolled onto something lethal
    const cur = ctx.state.units[ctx.sourceId]!
    const here = unitsAt(ctx.state, cur.x, cur.y, cur.region).filter((u) => u.id !== cur.id)
    if (here.length) {
      if (here.length === 1) {
        ctx.strike(cur, { unit: here[0].id })
      } else {
        // several share the entered location → the controller picks who is struck,
        // then the roll resumes for the remaining steps
        ctx.ask(
          { kind: 'chooseTargets', title: 'Hotwheel strikes which unit here?', data: { candidates: here.map((u) => u.id), count: 1, kind: 'unit' } },
          'hotwheelPick',
          { stepsLeft: steps - i - 1 },
        )
        return
      }
    }
    if (!ctx.state.units[ctx.sourceId]) return checkStateBased(ctx.state)
  }
  checkStateBased(ctx.state)
}
