import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Bearer has "Whenever this unit casts a spell, they may deal 1 damage to
//  target nearby unit to have you gain 1 life."'
registerScript('Ring of Morrigan', {
  onSpellCast: (ctx, by, _cardName, casterId) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || by !== ctx.controller || !casterId || art.carriedBy !== casterId) return
    const bearer = ctx.state.units[casterId]
    if (!bearer) return
    const prey = nearbySquaresW(ctx.state, bearer.x, bearer.y)
      // nearby minion is region-locked to the bearer
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, bearer.region))
      .filter((u) => u.id !== bearer.id)
      .map((u) => u.id)
    if (!prey.length) return
    ctx.ask({ kind: 'chooseTargets', title: "Ring of Morrigan: bleed whom for 1 life? (skip for none)", data: { candidates: prey, count: 1, upTo: true, kind: 'unit' } }, 'bleed')
  },
  conts: {
    bleed: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id !== 'string' || !ctx.state.units[id]) return
      ctx.dealDamage({ unit: id }, 1)
      ctx.gainLife(ctx.controller, 1)
    },
  },
})
