import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { effAttack, hasSubtype } from '../../../engine/statics'
import { isDyingUnit } from '../../../engine/effects'

// 'For each point of its power, an allied Monster may deal 1 damage to a unit in
// a square near it.'
registerScript('Abyssal Assault', {
  targets: [{
    what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied Monster',
    filter: (state, u) => hasSubtype(state, u, 'Monster'),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const monster = ctx.state.units[t.unit]
    if (!monster) return
    nextLash(ctx, monster.id, effAttack(ctx.state, monster))
  },
  conts: {
    lash: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (id && ctx.state.units[id]) ctx.dealDamage({ unit: id }, 1)
      nextLash(ctx, contCtx.monsterId, contCtx.left - 1)
    },
  },
})

function nextLash(ctx: EffectAPI, monsterId: string, left: number) {
  const monster = ctx.state.units[monsterId]
  if (!monster || left <= 0) return
  const candidates = nearbySquaresW(ctx.state, monster.x, monster.y)
    // nearby minion is region-locked to the source
    .flatMap((s) => unitsAt(ctx.state, s.x, s.y, monster.region))
    // skip the source AND any unit already doomed by a prior lash — its lethal damage is deferred to
    // the event boundary, so it still lingers in state.units here; offering it would dangle a ghost
    // target (a candidate with no board affordance) once the death settles. See [[deferred-death...]].
    .filter((u) => u.id !== monsterId && !isDyingUnit(ctx.state, u))
    .map((u) => u.id)
  if (!candidates.length) return
  ctx.ask(
    { kind: 'chooseTargets', title: `Abyssal Assault: ${left} lash(es) left — strike whom? `, data: { candidates: [...new Set(candidates)], count: 1, upTo: true, kind: 'unit' } },
    'lash',
    { monsterId, left },
  )
}
