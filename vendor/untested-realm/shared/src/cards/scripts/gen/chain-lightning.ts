import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Deal 2 damage to target unit nearby. Any number of times, you may spend â‘¡ to
// additionally target a new unit nearby the previous one.'
// FAQ: all costs paid and targets chosen at cast time, each target must be NEW,
// and all damage resolves simultaneously at the end.
registerScript('Chain Lightning', {
  targets: [{ what: 'unit', count: 1, targeted: true, where: 'nearby', label: 'target unit nearby' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    chainAsk(ctx, [t.unit])
  },
  conts: {
    jump: (ctx, contCtx, choice) => {
      if (!choice) return chainResolve(ctx, contCtx.chain)
      const p = ctx.state.players[ctx.controller]
      const prev = ctx.state.units[contCtx.chain[contCtx.chain.length - 1]]
      if (p.mana < 2 || !prev) return chainResolve(ctx, contCtx.chain)
      const candidates = nearbySquaresW(ctx.state, prev.x, prev.y)
        .flatMap((s) => unitsAt(ctx.state, s.x, s.y, prev.region))
        .filter((u) => !contCtx.chain.includes(u.id) && !(u.stealth && u.controller !== ctx.controller))
        .map((u) => u.id)
      if (!candidates.length) return chainResolve(ctx, contCtx.chain)
      ctx.ask({ kind: 'chooseTargets', title: 'Chain to which NEW unit?', data: { candidates: [...new Set(candidates)], count: 1, kind: 'unit' } }, 'zap', { chain: contCtx.chain })
    },
    zap: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (!id || !ctx.state.units[id] || contCtx.chain.includes(id)) return chainResolve(ctx, contCtx.chain)
      ctx.spendMana(ctx.controller, 2)
      chainAsk(ctx, [...contCtx.chain, id])
    },
  },
})

function chainAsk(ctx: EffectAPI, chain: string[]) {
  if (ctx.state.players[ctx.controller].mana >= 2) {
    ctx.ask({ kind: 'yesNo', title: `Chain Lightning (${chain.length} target(s) so far): spend â‘¡ to add another?` }, 'jump', { chain })
  } else {
    chainResolve(ctx, chain)
  }
}

// simultaneous damage to every chained target
function chainResolve(ctx: EffectAPI, chain: string[]) {
  for (const id of chain) {
    if (ctx.state.units[id]) ctx.dealDamage({ unit: id }, 2)
  }
}
