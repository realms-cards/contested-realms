import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { checkStateBased } from '../../../engine/effects'
import { isLegalStep, takeOwnStep } from '../../../engine/movement'
import type { GameState, Region, Step, UnitState } from '../../../engine/types'
import { waterBody } from '../multi-card-utils/water-body'

/** "move one step" is the unit's own step (Codex, Step): Immobile stays, Airborne may go diagonally,
 *  Submerge may cross between surface and underwater — but only to another square of this body. */
function stepsWithin(state: GameState, u: UnitState, body: { x: number; y: number }[]): Step[] {
  const from: Step = { x: u.x, y: u.y, region: u.region }
  const regions: Region[] = [u.region, ...(['surface', 'underwater'] as Region[]).filter((r) => r !== u.region)]
  const out: Step[] = []
  for (const b of body) {
    if (b.x === u.x && b.y === u.y) continue
    const region = regions.find((r) => isLegalStep(state, u, from, { x: b.x, y: b.y, region: r }))
    if (region) out.push({ x: b.x, y: b.y, region })
  }
  return out
}

// 'Genesis → Staying within this body of water, move target unit one step.'
registerScript('Undertow', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const body = waterBody(ctx.state, self.x, self.y)
    // "target unit": an enemy's Stealth hides it from targeting (as a targeted TargetSpec does); and the
    // Genesis isn't optional — a legal target must be chosen
    const swimmers = body.flatMap((s) => unitsAt(ctx.state, s.x, s.y))
      .filter((u) => !(u.stealth && u.controller !== ctx.controller))
      .map((u) => u.id)
    if (!swimmers.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The undertow tugs at which unit?', data: { candidates: swimmers, count: 1, upTo: false, kind: 'unit' } }, 'tug', { body })
  },
  conts: {
    tug: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      const body = c.body as { x: number; y: number }[]
      const steps = stepsWithin(ctx.state, u, body)
      if (!steps.length) return
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} is pulled where?`, data: { squares: steps.map((s) => ({ x: s.x, y: s.y })) } }, 'pullTo', { unitId: u.id, body })
    },
    pullTo: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (!u || !sq) return
      const to = stepsWithin(ctx.state, u, c.body as { x: number; y: number }[]).find((s) => s.x === sq.x && s.y === sq.y)
      if (to && takeOwnStep(ctx.state, u, to)) checkStateBased(ctx.state)
    },
  },
})
