import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { pushLog, tapUnit } from '../../../engine/effects'
import { canTapForCost } from '../../../engine/statics'
import { deadMinions, askDeadMinion, pickedDeadMinion, banishDeadMinion, canBanishDeadMinion } from '../multi-card-utils/dead-minions'
import { squaresWithinSteps } from '../multi-card-utils/step-range-targets'

/** push the "which corpse?" prompt (corpses drawn from both cemeteries) */
function askCorpseCatapult(ctx: EffectAPI, helperId: string): void {
  askDeadMinion(ctx, 'Fling which dead minion? (either cemetery)', 'ccCorpse', { helperId }, flingCorpse)
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
      if (!bearer || !canTapForCost(state, bearer)) return false
      const helper = unitsAt(state, art!.x, art!.y, art!.region).some((u) => u.id !== bearer.id && u.controller === bearer.controller && canTapForCost(state, u))
      return helper && canBanishDeadMinion(state, bearer.controller)
    },
    targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤3 steps)' }],
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const t = ctx.targets[0]
      if (!art || !t || !('square' in t)) return
      if (realStepDistanceW(ctx.state, art, t.square) > 3) return ctx.log('Out of range.') // "up to three steps away" (def. 1)
      const bearer = art.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!bearer || !canTapForCost(ctx.state, bearer)) return ctx.log('The bearer cannot be tapped to pay for this.')
      const helpers = unitsAt(ctx.state, art.x, art.y, art.region).filter((u) => u.id !== bearer.id && u.controller === ctx.controller && canTapForCost(ctx.state, u))
      if (!helpers.length) return ctx.log('Another untapped ally is needed here.')
      if (!deadMinions(ctx.state).length) return ctx.log('No corpse to fling.')
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
      if (!helper || helper.controller !== ctx.controller || !canTapForCost(ctx.state, helper)) return
      askCorpseCatapult(ctx, helperId)
    },
    ccCorpse: (ctx, c, choice) => flingCorpse(ctx, c, choice),
  },
})

// 2) banish the chosen corpse (from whichever cemetery holds it) and fling it
function flingCorpse(ctx: EffectAPI, c: Record<string, unknown>, choice: unknown): void {
  const dead = pickedDeadMinion(ctx.state, c, choice)
  const t = ctx.targets[0]
  const art = ctx.state.artifacts[ctx.sourceId]
  const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
  const helper = ctx.state.units[c.helperId as string]
  if (!dead || !t || !('square' in t) || !art || !bearer || !canTapForCost(ctx.state, bearer) || !helper || !canTapForCost(ctx.state, helper)) return
  if (!banishDeadMinion(ctx, dead)) return
  tapUnit(ctx.state, bearer)
  tapUnit(ctx.state, helper)
  const power = getCard(ctx.state.cards[dead].name).attack ?? 0
  for (const u of unitsAt(ctx.state, t.square.x, t.square.y, t.square.region ?? 'surface')) {
    ctx.dealDamage({ unit: u.id }, power)
  }
  pushLog(ctx.state, ctx.controller, `A ${ctx.state.cards[dead].name} sails overhead! (${power} damage)`)
}
