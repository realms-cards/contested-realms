import { registerScript } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'
import { pushLog, emitUnitMoved } from '../../../engine/effects'
import { isLegalStep } from '../../../engine/movement'
import { fightUnits } from '../../../engine/combat'

// "An ally targets an enemy they're adjacent to, then they both take a step to
// swap places. If they pass each other, they fight."
registerScript('Joust!', {
  // "an ally" / "an enemy" (not "minion") — both may be Avatars
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'your jouster' },
    { what: 'unit', count: 1, targeted: true, owner: 'enemy', label: 'target adjacent enemy' },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!('unit' in t1) || !('unit' in t2)) return
    const a = ctx.state.units[t1.unit]
    const b = ctx.state.units[t2.unit]
    if (!a || !b) return
    if (!adjacentSquaresW(ctx.state, a.x, a.y).some((s) => s.x === b.x && s.y === b.y) || a.region !== b.region) return ctx.log('Not adjacent.')
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
