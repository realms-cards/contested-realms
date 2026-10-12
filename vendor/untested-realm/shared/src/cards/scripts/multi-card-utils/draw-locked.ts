import { type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'

/** draw the top spell into hand and bond it to a caster */
// `grantsCasting`: does the drawing effect confer the ability to cast (Archangel
// Gabriel — the chosen minion need not be a Spellcaster), or does it rely on the
// caster's own Spellcaster ability (Morgana, the Omphaloi)? The latter can't cast
// if transformed into a non-spellcaster, though the hand persists.
export function drawLocked(ctx: EffectAPI, casterId: string, label: string, grantsCasting = false): void {
  const p = ctx.state.players[ctx.controller]
  const top = p.spellbook.shift()
  if (top === undefined) return
  p.hand.push(top)
  ctx.state.flow = ctx.state.flow ?? {}
  const casterName = ctx.state.units[casterId]?.name ?? ctx.state.artifacts[casterId]?.name
  ctx.state.flow.lockedCards = [...(ctx.state.flow.lockedCards ?? []), { cardId: top, casterId, casterName, grantsCasting }]
  // don't name the drawn card in the shared log (it's a hidden hand card — the
  // controller sees it in hand with the caster-lock badge; naming it would leak)
  pushLog(ctx.state, ctx.controller, `A spell is drawn — only ${label} may cast it.`)
}
