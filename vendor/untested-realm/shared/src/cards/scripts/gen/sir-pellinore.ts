import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import { avgPow } from '../multi-card-utils/avg-pow'
import type { UnitState } from '../../../engine/types'

// 'Whenever Sir Pellinore kills the strongest enemy minion, draw a card.'
// Codex Strongest: strictly the highest power (split power → the average, rounded down); on a tie
// for strongest the ACTIVE player chooses which one is the strongest.
registerScript('Sir Pellinore', {
  onKill: (ctx, victim) => {
    if (victim.isAvatar || victim.controller === ctx.controller) return // an enemy minion only
    const pow = avgPow(ctx.state, victim as UnitState)
    const rivals = Object.values(ctx.state.units).filter((u) => !u.isAvatar && u.id !== victim.id && u.controller === victim.controller)
    const top = Math.max(pow, ...rivals.map((u) => avgPow(ctx.state, u)))
    if (pow < top) return
    const tied = rivals.filter((u) => avgPow(ctx.state, u) === top)
    if (!tied.length) return questDraw(ctx)
    ctx.ask(
      {
        kind: 'yesNo',
        title: `Sir Pellinore: ${victim.name} ties with ${tied.map((u) => u.name).join(', ')} for strongest. Was ${victim.name} the strongest (Sir Pellinore's controller draws)?`,
        data: {},
        player: ctx.state.activePlayer,
      },
      'tie',
    )
  },
  conts: {
    tie: (ctx, _c, choice) => { if (choice === true) questDraw(ctx) },
  },
})

function questDraw(ctx: EffectAPI): void {
  ctx.drawCard(ctx.controller)
  pushLog(ctx.state, ctx.controller, 'The Questing King fells the mightiest — and learns from it.')
}
