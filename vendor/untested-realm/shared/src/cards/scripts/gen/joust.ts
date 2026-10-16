import { registerScript } from '../registry'
import { pushLog, emitUnitMoved } from '../../../engine/effects'
import { isLegalStep } from '../../../engine/movement'
import { fightUnits } from '../../../engine/combat'
import { adjacentFightTargets, resolveAdjacentCombatants } from '../multi-card-utils/adjacent-fight'

// "An ally targets an enemy they're adjacent to, then they both take a step to
// swap places. If they pass each other, they fight."
registerScript('Joust!', {
  targets: adjacentFightTargets('your jouster'),
  onCast: (ctx) => {
    const pair = resolveAdjacentCombatants(ctx)
    if (!pair) return ctx.log('Not adjacent.')
    const { a, b } = pair
    // FAQ: "they BOTH take a step to swap places" — if either can't take its step (Immobile, disabled, a
    // wall or entry-ban between them), they haven't passed each other, so no joust.
    const aFrom = { x: a.x, y: a.y, region: a.region }
    const bFrom = { x: b.x, y: b.y, region: b.region }
    if (!isLegalStep(ctx.state, a, aFrom, bFrom) || !isLegalStep(ctx.state, b, bFrom, aFrom)) {
      return ctx.log('One of them cannot take the step — no joust occurs.')
    }
    a.x = bFrom.x; a.y = bFrom.y
    b.x = aFrom.x; b.y = aFrom.y
    emitUnitMoved(ctx.state, a, aFrom) // both units "take a step" — fire on-enter triggers for the new squares
    emitUnitMoved(ctx.state, b, bFrom)
    if (!ctx.state.units[a.id] || !ctx.state.units[b.id]) return // an on-enter trigger removed a jouster
    pushLog(ctx.state, ctx.controller, `${a.name} and ${b.name} joust past each other!`)
    // they pass each other and fight — a real simultaneous strike exchange (Interrogator, Lethal, …)
    fightUnits(ctx.state, a, b)
  },
})
