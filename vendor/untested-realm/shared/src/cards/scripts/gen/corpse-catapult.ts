import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { pushLog } from '../../../engine/effects'
import { squaresWithinSteps } from '../multi-card-utils/step-range-targets'
import type { GameState, PlayerId } from '../../../engine/types'

// corpses (dead minions) available to fling — from EITHER cemetery, player's choice.
function corpseCatapultCorpses(state: GameState): string[] {
  const out: string[] = []
  for (const pl of [0, 1] as PlayerId[]) {
    for (const id of state.players[pl].cemetery) {
      if (getCard(state.cards[id].name).type === 'Minion') out.push(id)
    }
  }
  return out
}

/** push the "which corpse?" prompt (corpses drawn from both cemeteries) */
function askCorpseCatapult(ctx: EffectAPI, helperId: string): void {
  const corpses = corpseCatapultCorpses(ctx.state)
  ctx.ask(
    { kind: 'chooseCards', title: 'Fling which dead minion? (either cemetery)', data: { cards: corpses.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
    'ccCorpse',
    { helperId, corpses },
  )
}

registerScript('Corpse Catapult', {
  // fling's legal set: every square ≤3 steps from the catapult's bearer (the ability anchor for a
  // carried artifact) → the ability path highlights/permits exactly these and rejects a too-far pick.
  targetOptions: (state, caster) => squaresWithinSteps(state, caster, 3),
  abilities: [{
    key: 'fling',
    label: 'Fling a corpse (tap bearer + ally here)',
    cost: {},
    // gate the button on the LIVE preconditions so it enables/disables as the cemetery (and the
    // bearer / co-located allies) change — canActivate re-runs this every render. Without it the
    // button was always clickable and only the effect() failed, so it never tracked the cemetery.
    available: (state, sourceId) => {
      const art = state.artifacts[sourceId]
      const bearer = art?.carriedBy ? state.units[art.carriedBy] : null
      if (!bearer || bearer.tapped) return false
      const helper = unitsAt(state, art!.x, art!.y, art!.region).some((u) => u.id !== bearer.id && u.controller === bearer.controller && !u.tapped)
      return helper && corpseCatapultCorpses(state).length > 0
    },
    targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤3 steps)' }],
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const t = ctx.targets[0]
      if (!art || !t || !('square' in t)) return
      if (realStepDistanceW(ctx.state, art, t.square) > 3) return ctx.log('Out of range.') // "up to three steps away" (def. 1)
      const bearer = art.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!bearer || bearer.tapped) return ctx.log('The bearer must be untapped.')
      const helpers = unitsAt(ctx.state, art.x, art.y, art.region).filter((u) => u.id !== bearer.id && u.controller === ctx.controller && !u.tapped)
      if (!helpers.length) return ctx.log('Another untapped ally is needed here.')
      if (!corpseCatapultCorpses(ctx.state).length) return ctx.log('No corpse to fling.')
      // 1) choose which ally helps (auto only when there is exactly one)
      if (helpers.length > 1) {
        ctx.ask(
          { kind: 'chooseTargets', title: 'Tap which ally to help fling?', data: { candidates: helpers.map((u) => u.id), count: 1, kind: 'unit' } },
          'ccHelper',
        )
      } else {
        askCorpseCatapult(ctx, helpers[0].id)
      }
    },
  }],
  conts: {
    ccHelper: (ctx, _c, choice) => {
      const helperId = Array.isArray(choice) ? choice[0] : choice
      if (typeof helperId !== 'string') return
      const helper = ctx.state.units[helperId]
      if (!helper || helper.controller !== ctx.controller || helper.tapped) return
      askCorpseCatapult(ctx, helperId)
    },
    // 2) banish the chosen corpse (from whichever cemetery holds it) and fling it
    ccCorpse: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const dead = (c.corpses as string[])[idx]
      const t = ctx.targets[0]
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      const helper = ctx.state.units[c.helperId as string]
      if (!dead || !t || !('square' in t) || !art || !bearer || bearer.tapped || !helper || helper.tapped) return
      // remove the corpse from its cemetery → its owner's banished pile
      let banished = false
      for (const pl of [0, 1] as PlayerId[]) {
        const cem = ctx.state.players[pl].cemetery
        const i = cem.indexOf(dead)
        if (i >= 0) { cem.splice(i, 1); ctx.state.players[pl].banished.push(dead); banished = true; break }
      }
      if (!banished) return
      bearer.tapped = true
      helper.tapped = true
      const power = getCard(ctx.state.cards[dead].name).attack ?? 0
      for (const u of unitsAt(ctx.state, t.square.x, t.square.y, t.square.region ?? 'surface')) {
        ctx.dealDamage({ unit: u.id }, power)
      }
      pushLog(ctx.state, ctx.controller, `A ${ctx.state.cards[dead].name} sails overhead! (${power} damage)`)
    },
  },
})
