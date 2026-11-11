import { registerScript, type EffectAPI } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'
import { reactivateProblem, reactivateTrap } from '../multi-card-utils/trap-reactivate'

// 'Genesis → You may reactivate an adjacent Trap for (1) less.'
// Codex (Trap): to reactivate a trap is to activate its trap ability while it's face-up, paying the mana
// and controlling the effect. Any face-up trap at an adjacent site (this square or a bordering one) whose
// ability you could pay for now, (1) cheaper.
function reactivatable(ctx: EffectAPI): string[] {
  const self = ctx.state.sites[ctx.sourceId]
  if (!self) return []
  const adj = adjacentSquaresW(ctx.state, self.x, self.y)
  return Object.values(ctx.state.sites)
    .filter((s) => s.id !== self.id && adj.some((a) => a.x === s.x && a.y === s.y))
    .filter((s) => !reactivateProblem(ctx.state, ctx.controller, s.id, 1))
    .map((s) => s.id)
}

registerScript("Trapper's Rest", {
  genesis: (ctx) => {
    const traps = reactivatable(ctx)
    if (!traps.length) return
    ctx.ask(
      { kind: 'chooseTargets', title: "Trapper's Rest: reactivate an adjacent trap for (1) less?", data: { candidates: traps, count: 1, upTo: true, kind: 'site', notTargeted: true } },
      'reactivate',
    )
  },
  conts: {
    reactivate: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && reactivatable(ctx).includes(id)) reactivateTrap(ctx.state, ctx.controller, id, 1)
    },
  },
})
