import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { effAttack, hasSubtype } from '../../../engine/statics'

// 'For each point of its power, an allied Monster may deal 1 damage to a unit in
// a square near it.'
// A SQUARE, not a location: a unit in any region of a nearby square (under- or above-ground) may be hit.
// "a unit", not "target unit": choosing it isn't targeting (notTargeted), so a ward reacts to the damage.
// FAQ: each point may go to a different unit, and the damage is dealt simultaneously — so every lash is
// chosen first, then all are dealt in one pass (a Ward prevents all of it; Shield Maidens reduce each).
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
    nextLash(ctx, monster.id, effAttack(ctx.state, monster), [])
  },
  conts: {
    lash: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const picks = contCtx.picks as string[]
      // "Take none" → the remaining points are passed up; deal what was chosen
      if (typeof id !== 'string' || !ctx.state.units[id]) return dealLashes(ctx, picks)
      nextLash(ctx, contCtx.monsterId, contCtx.left - 1, [...picks, id])
    },
  },
})

function nextLash(ctx: EffectAPI, monsterId: string, left: number, picks: string[]) {
  const monster = ctx.state.units[monsterId]
  if (!monster || left <= 0) return dealLashes(ctx, picks)
  const candidates = nearbySquaresW(ctx.state, monster.x, monster.y)
    .flatMap((s) => unitsAt(ctx.state, s.x, s.y)) // every region of the square
    .filter((u) => u.id !== monsterId)
    .map((u) => u.id)
  if (!candidates.length) return dealLashes(ctx, picks)
  ctx.ask(
    { kind: 'chooseTargets', title: `Abyssal Assault: ${left} lash(es) left — strike whom?`, data: { candidates: [...new Set(candidates)], count: 1, upTo: true, kind: 'unit', notTargeted: true } },
    'lash',
    { monsterId, left, picks },
  )
}

/** all the chosen points land at once: one simultaneous pass, so a ward that absorbs the first prevents
 *  the rest too (flow.wardAbsorbed, as in a combat strike pass); deaths settle when the effect ends. */
function dealLashes(ctx: EffectAPI, picks: string[]) {
  if (!picks.length) return
  ctx.state.flow = ctx.state.flow ?? {}
  ctx.state.flow.wardAbsorbed = []
  for (const id of picks) if (ctx.state.units[id]) ctx.dealDamage({ unit: id }, 1)
  delete ctx.state.flow.wardAbsorbed
}
