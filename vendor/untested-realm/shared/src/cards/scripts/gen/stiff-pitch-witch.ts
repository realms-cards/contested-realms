import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { pushLog, tapUnit } from '../../../engine/effects'
import { canTapForCost } from '../../../engine/statics'
import { squaresWithinSteps } from '../multi-card-utils/step-range-targets'
import { deadMinions, askDeadMinion, pickedDeadMinion, banishDeadMinion, canBanishDeadMinion } from '../multi-card-utils/dead-minions'
import type { EffectAPI } from '../registry'

// 'Tap, Banish a dead minion → Target a location up to three steps away. Each unit there takes 2 damage.'
// "A dead minion" is any minion in either cemetery. Like Corpse Catapult's fling, the location is any
// square up to three real steps from the Witch, in her region unless the pick names another.
registerScript('Stiff-pitch Witch', {
  targetOptions: (state, caster) => squaresWithinSteps(state, caster, 3),
  abilities: [{
    key: 'treat',
    label: 'Throw a dead minion (2 damage to each unit at a location ≤3 steps away)',
    // both costs are paid together once the dead minion is picked and banished (tap included), so a
    // banish that can't happen (the Bureau of Occult Control's toll) leaves the Witch untapped
    cost: {},
    available: (state, sourceId) => !!state.units[sourceId] && canTapForCost(state, state.units[sourceId]) && canBanishDeadMinion(state, state.units[sourceId].controller),
    targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤3 steps)' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('square' in t)) return
      if (realStepDistanceW(ctx.state, self, t.square) > 3) return ctx.log('Out of range.')
      if (!deadMinions(ctx.state).length) return ctx.log('No dead minion to throw.')
      askDeadMinion(ctx, 'Stiff-pitch Witch: banish which dead minion? (either cemetery)', 'treat', {}, treat)
    },
  }],
  conts: { treat: (ctx, c, choice) => treat(ctx, c, choice) },
})

/** the picked dead minion is banished and the Witch taps (both costs together), then the location takes 2 */
function treat(ctx: EffectAPI, c: Record<string, unknown>, choice: unknown): void {
  const self = ctx.state.units[ctx.sourceId]
  const dead = pickedDeadMinion(ctx.state, c, choice)
  const t = ctx.targets[0]
  if (!self || !dead || !t || !('square' in t) || !canTapForCost(ctx.state, self)) return
  if (!banishDeadMinion(ctx, dead)) return
  tapUnit(ctx.state, self)
  pushLog(ctx.state, ctx.controller, `The Witch hurls ${ctx.state.cards[dead].name} — a treat for everyone there.`)
  for (const u of unitsAt(ctx.state, t.square.x, t.square.y, t.square.region ?? self.region)) ctx.dealDamage({ unit: u.id }, 2)
}
