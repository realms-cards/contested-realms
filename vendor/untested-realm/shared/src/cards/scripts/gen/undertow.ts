import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { checkStateBased } from '../../../engine/effects'
import { isLegalStep, takeOwnStep } from '../../../engine/movement'
import type { GameState, Region, Step, UnitState } from '../../../engine/types'
import { waterBody } from '../multi-card-utils/water-body'

/** "move one step" is the unit's own step (Codex, Step): Immobile stays, Airborne may go diagonally,
 *  Submerge may cross between surface and underwater as its step — including diving/surfacing in place —
 *  but only within this body. Every legal (square, level) pair. */
function stepsWithin(state: GameState, u: UnitState, body: { x: number; y: number }[]): Step[] {
  const from: Step = { x: u.x, y: u.y, region: u.region }
  const out: Step[] = []
  for (const b of body) {
    for (const region of ['surface', 'underwater'] as Region[]) {
      if (b.x === u.x && b.y === u.y && region === u.region) continue // staying put isn't a step
      if (isLegalStep(state, u, from, { x: b.x, y: b.y, region })) out.push({ x: b.x, y: b.y, region })
    }
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
      const squares = steps.filter((s, i) => steps.findIndex((t) => t.x === s.x && t.y === s.y) === i).map((s) => ({ x: s.x, y: s.y }))
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} is pulled where?`, data: { squares } }, 'pullTo', { unitId: u.id, body })
    },
    pullTo: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (!u || !sq) return
      const here = stepsWithin(ctx.state, u, c.body as { x: number; y: number }[]).filter((s) => s.x === sq.x && s.y === sq.y)
      if (here.length > 1) {
        // a Submerge minion may end its step on the surface or underwater there: its mover picks
        ctx.ask({ kind: 'chooseOption', title: `${u.name}: surface or underwater?`, data: { options: here.map((s) => s.region) } }, 'pullRegion', { unitId: u.id, body: c.body, x: sq.x, y: sq.y })
        return
      }
      if (here[0] && takeOwnStep(ctx.state, u, here[0])) checkStateBased(ctx.state)
    },
    pullRegion: (ctx, c, region) => {
      const u = ctx.state.units[c.unitId as string]
      if (!u) return
      const to = stepsWithin(ctx.state, u, c.body as { x: number; y: number }[]).find((s) => s.x === c.x && s.y === c.y && s.region === region)
      if (to && takeOwnStep(ctx.state, u, to)) checkStateBased(ctx.state)
    },
  },
})
