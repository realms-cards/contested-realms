import { registerScript, getScript, type EffectAPI } from '../registry'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'
import { orthAdjacentWrapped, occupies, occupiedSquares } from '../../../engine/grid'
import { effKeywords, attackBlockedAt } from '../../../engine/statics'
import { isLegalStep, reachableLocations, findPath, resolveMovement, stepDistance } from '../../../engine/movement'
import { beginAttack } from '../../../engine/combat'
import type { UnitState } from '../../../engine/types'

// 'At the start of each player's turn, Crave Golem attacks a random minion
//  within its range of motion, or takes a step toward the closest minion if it
//  can't.' (FAQ: a real, defendable attack — allies included, no tap; the
//  controller resolves ties on the hungry step)
registerScript('Crave Golem', {
  startOfEachTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const kw = effKeywords(ctx.state, self)
    const truesight = self.carrying.some((id) => getScript(ctx.state.artifacts[id]?.name ?? '')?.bearerTruesight)
    const canHit = (u: UnitState) =>
      !u.isAvatar &&
      u.id !== self.id &&
      !(u.stealth && !truesight) &&
      !(effKeywords(ctx.state, u).airborne && !kw.airborne && u.region === 'surface') &&
      !(u.region === 'surface' && attackBlockedAt(ctx.state, u.x, u.y, u))
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
    // nothing in range: one hungry step toward whoever is closest to reach
    const prey = Object.values(ctx.state.units).filter(canHit)
    if (!prey.length) return
    const closest = [...prey].sort((a, b) => stepDistance(self, a) - stepDistance(self, b))[0]
    const best = orthAdjacentWrapped(ctx.state, self.x, self.y).filter(
      (s) =>
        stepDistance(s, closest) < stepDistance(self, closest) &&
        isLegalStep(ctx.state, self, { x: self.x, y: self.y, region: self.region }, { x: s.x, y: s.y, region: self.region }),
    )
    if (!best.length) return
    if (best.length === 1) {
      resolveMovement(ctx.state, self, [{ x: best[0].x, y: best[0].y, region: self.region }])
      pushLog(ctx.state, ctx.controller, 'The Crave Golem lumbers toward fresh prey.')
      return
    }
    ctx.ask({ kind: 'chooseSquare', title: 'The Crave Golem craves — which way does it lumber?', data: { squares: best } }, 'lumber')
  },
  conts: {
    lumber: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq || !orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) return
      resolveMovement(ctx.state, self, [{ x: sq.x, y: sq.y, region: self.region }])
    },
    crave: (ctx, c, choice) => craveAttack(ctx, (c.__opts as string[])[luckyChoiceIndex(c, choice)]),
  },
})

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
