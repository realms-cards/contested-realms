import { registerScript, getScript, type EffectAPI } from '../registry'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'
import { occupies, occupiedSquares } from '../../../engine/grid'
import { effKeywords, attackBlockedAt } from '../../../engine/statics'
import { reachableLocations, findPath, resolveMovement, takeOwnStep } from '../../../engine/movement'
import { stepsTowardClosest } from '../multi-card-utils/own-step'
import { beginAttack } from '../../../engine/combat'
import type { GameState, Step, UnitState } from '../../../engine/types'

// 'At the start of each player's turn, Crave Golem attacks a random minion
//  within its range of motion, or takes a step toward the closest minion if it
//  can't.' (FAQ: a real, defendable attack — allies included, no tap; the
//  controller resolves ties on the hungry step)
// FAQ: "Imagine the Crave Golem had unlimited movement. Are there any minions it could attack now? If
// not, it doesn't move … If so, take one step toward the minion that requires the fewest Crave Golem
// steps to reach." — closeness in its own steps (range of motion), not straight-line distance.
registerScript('Crave Golem', {
  startOfEachTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const canHit = attackable(ctx.state, self)
    const spots = [{ x: self.x, y: self.y, region: self.region }, ...reachableLocations(ctx.state, self)]
    const inReach = Object.values(ctx.state.units).filter(
      (u) => canHit(u) && spots.some((s) => occupies(u, s.x, s.y, s.region as any)),
    )
    if (inReach.length) {
      // which minion the hunger falls on is random → Lucky Charm / Kythera may bend it
      const pick = ctx.lucky(inReach.map((u) => ({ label: u.name, payload: u.id })), 'crave', 'cards')
      if (pick !== undefined) craveAttack(ctx, pick as string)
      return
    }
    // nothing in range: one hungry step toward whoever takes the fewest of its steps to reach
    const best = hungrySteps(ctx)
    if (!best.length) return
    if (best.length === 1) {
      if (takeOwnStep(ctx.state, self, best[0])) pushLog(ctx.state, ctx.controller, 'The Crave Golem lumbers toward fresh prey.')
      return
    }
    ctx.ask({ kind: 'chooseSquare', title: 'The Crave Golem craves — which way does it lumber?', data: { squares: best.map((s) => ({ x: s.x, y: s.y })) } }, 'lumber')
  },
  conts: {
    lumber: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      const step = self && sq ? hungrySteps(ctx).find((s) => s.x === sq.x && s.y === sq.y) : undefined
      if (self && step) takeOwnStep(ctx.state, self, step)
    },
    crave: (ctx, c, choice) => craveAttack(ctx, (c.__opts as string[])[luckyChoiceIndex(c, choice)]),
  },
})

// the minions it could attack (FAQ: "It still cannot attack Airborne or Stealth units unless it gains a
// special ability that allows it to do so"; allies included)
function attackable(state: GameState, self: UnitState): (u: UnitState) => boolean {
  const kw = effKeywords(state, self)
  const truesight = self.carrying.some((id) => getScript(state.artifacts[id]?.name ?? '')?.bearerTruesight)
  return (u) =>
    !u.isAvatar &&
    u.id !== self.id &&
    !(u.stealth && !truesight) &&
    !(effKeywords(state, u).airborne && !kw.airborne && u.region === 'surface') &&
    !(u.region === 'surface' && attackBlockedAt(state, u.x, u.y, u))
}

// the hungry step: toward the minion it could attack that takes the fewest of its own steps to reach
function hungrySteps(ctx: EffectAPI): Step[] {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return []
  return stepsTowardClosest(ctx.state, self, Object.values(ctx.state.units).filter(attackable(ctx.state, self)))
}

// shared apply for Crave Golem's random attack (inline pick or Lucky-Charm choice)
function craveAttack(ctx: EffectAPI, victimId: string): void {
  const self = ctx.state.units[ctx.sourceId]
  const victim = ctx.state.units[victimId]
  if (!self || !victim) return
  if (!occupiedSquares(self).some((s) => occupies(victim, s.x, s.y, self.region))) {
    const path = findPath(ctx.state, self, { x: victim.x, y: victim.y, region: victim.region })
    if (path) resolveMovement(ctx.state, self, path)
  }
  const alive = ctx.state.units[self.id]
  if (alive && ctx.state.units[victimId] && occupiedSquares(alive).some((s) => occupies(victim, s.x, s.y))) {
    pushLog(ctx.state, ctx.controller, `The Crave Golem hungers — it attacks ${victim.name}!`)
    beginAttack(ctx.state, alive, { unit: victimId }, { allowAllied: true })
  }
}
