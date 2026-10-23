import { registerScript, type EffectAPI } from '../registry'
import { inBounds, siteAt, unitsAt } from '../../../engine/grid'
import { checkStateBased, emitUnitMoved, makeCtx, registerCont, resumeWhenSettled } from '../../../engine/effects'
import { isLegalStep } from '../../../engine/movement'
import { strikeOnce } from '../multi-card-utils/strike-once'
import type { PlayerId } from '../../../engine/types'

// 'Tap â†’ Move three steps in a cardinal direction. When Bull Demons of Adum enter
// each location, they strike each untapped unit there.'
registerScript('Bull Demons of Adum', {
  abilities: [{
    key: 'rampage',
    label: 'Tap → Rampage 3 steps in a direction',
    cost: { tap: true },
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Rampage in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'go')
    },
  }],
  conts: {
    go: (ctx, _c, dir) => rampage(ctx, dir as string, 3),
  },
})

// An entered location's trigger asked something (a Troll Bridge's toll): the rampage waited for it, and
// now strikes here and goes on (Storyline: the triggered event resolves before the rest of the rampage).
registerCont('bull-demons:resume', (state, c: { sourceId: string; controller: PlayerId; dir: string; stepsLeft: number }) => {
  const ctx = makeCtx(state, c.sourceId, c.controller, [])
  if (!state.units[c.sourceId]) return checkStateBased(state)
  strikeHere(ctx)
  if (state.units[c.sourceId]) rampage(ctx, c.dir, c.stepsLeft)
  else checkStateBased(state)
})

// "they strike each untapped unit there"
function strikeHere(ctx: EffectAPI): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  for (const u of unitsAt(ctx.state, self.x, self.y, self.region)) {
    if (u.id !== self.id && !u.tapped) strikeOnce(ctx, self, u.id)
  }
}

function rampage(ctx: EffectAPI, dir: string, steps: number): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
  const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
  for (let i = 0; i < steps; i++) {
    const from = { x: self.x, y: self.y, region: self.region }
    const to = { x: self.x + dx, y: self.y + dy, region: self.region }
    if (!inBounds(to.x, to.y) || !siteAt(ctx.state, to.x, to.y)) break
    // each of the three steps is a real STEP — a wall / entry-ban / Immobile stops the rampage there
    if (!isLegalStep(ctx.state, self, from, to)) break
    self.x = to.x
    self.y = to.y
    const asked = ctx.state.prompts.length
    emitUnitMoved(ctx.state, self, from) // "enter each location" — fire on-enter triggers
    if (!ctx.state.units[self.id]) return // an on-enter trigger felled it
    if (ctx.state.prompts.length > asked) {
      resumeWhenSettled(ctx.state, 'bull-demons:resume', { sourceId: self.id, controller: ctx.controller, dir, stepsLeft: steps - i - 1 })
      return
    }
    strikeHere(ctx)
    if (!ctx.state.units[self.id]) return // died mid-rampage somehow
  }
  checkStateBased(ctx.state)
}
