import { registerScript, type EffectAPI } from '../registry'
import { inBounds, siteAt, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { checkStateBased, emitUnitMoved, makeCtx, registerCont, resumeWhenSettled } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

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

// An entered location's trigger asked something (a Troll Bridge's toll): the roll waited for it, and now
// strikes here and rolls on (Storyline: the triggered event resolves before the rest of the roll).
registerCont('hotwheel:resume', (state, c: { sourceId: string; controller: PlayerId; stepsLeft: number }) => {
  const ctx = makeCtx(state, c.sourceId, c.controller, [])
  if (!state.units[c.sourceId]) return checkStateBased(state)
  if (strikeHere(ctx, c.stepsLeft)) hotwheelRoll(ctx, c.stepsLeft)
})

// strike ONE unit at the Hotwheel's location — the controller chooses which when several share it.
// false when it had to ask: the roll then resumes in hotwheelPick.
function strikeHere(ctx: EffectAPI, stepsLeft: number): boolean {
  const cur = ctx.state.units[ctx.sourceId]
  if (!cur) return false
  const here = unitsAt(ctx.state, cur.x, cur.y, cur.region).filter((u) => u.id !== cur.id)
  if (here.length === 1) ctx.strike(cur, { unit: here[0].id })
  if (here.length > 1) {
    ctx.ask(
      { kind: 'chooseTargets', title: 'Hotwheel strikes which unit here?', data: { candidates: here.map((u) => u.id), count: 1, kind: 'unit' } },
      'hotwheelPick',
      { stepsLeft },
    )
    return false
  }
  return true
}

// roll forward up to `steps` more locations, striking at each entered one
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
    // Briar Patch thorns, Druid, Dark Alley, Root Spider, Troll Bridge, etc.
    const asked = ctx.state.prompts.length
    emitUnitMoved(ctx.state, self, from, 'forced')
    if (!ctx.state.units[ctx.sourceId]) return checkStateBased(ctx.state) // rolled onto something lethal
    const stepsLeft = steps - i - 1
    if (ctx.state.prompts.length > asked) {
      resumeWhenSettled(ctx.state, 'hotwheel:resume', { sourceId: ctx.sourceId, controller: ctx.controller, stepsLeft })
      return
    }
    if (!strikeHere(ctx, stepsLeft)) return
    if (!ctx.state.units[ctx.sourceId]) return checkStateBased(ctx.state)
  }
  checkStateBased(ctx.state)
}
