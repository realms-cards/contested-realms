import { type EffectAPI } from '../registry'
import { emitEvent, pushLog, registerSpellDraw } from '../../../engine/effects'

/** draw the top spell into hand and bond it to a caster */
// `grantsCasting`: does the drawing effect confer the ability to cast (Archangel
// Gabriel — the chosen minion need not be a Spellcaster), or does it rely on the
// caster's own Spellcaster ability (Morgana, the Omphaloi)? The latter can't cast
// if transformed into a non-spellcaster, though the hand persists.
export function drawLocked(ctx: EffectAPI, casterId: string, label: string, grantsCasting = false): void {
  // A caster-locked draw is still a spell draw by the player: Garden of Eden caps it at one
  // per turn (FAQ — Morgana/the Omphaloi draw only 1 while it's active). Gate before pulling.
  if (!registerSpellDraw(ctx.state, ctx.controller)) return
  const p = ctx.state.players[ctx.controller]
  const top = p.spellbook.shift()
  if (top === undefined) return
  p.hand.push(top)
  ctx.state.flow = ctx.state.flow ?? {}
  const casterName = ctx.state.units[casterId]?.name ?? ctx.state.artifacts[casterId]?.name
  ctx.state.flow.lockedCards = [...(ctx.state.flow.lockedCards ?? []), { cardId: top, casterId, casterName, grantsCasting }]
  // it still counts as the player drawing (Codex, Draw: "e.g. Morgana le Fay, Omphalos") — Chains of Prometheus
  ctx.state.flow.drawsThisTurn = ctx.state.flow.drawsThisTurn ?? { 0: 0, 1: 0 }
  ctx.state.flow.drawsThisTurn[ctx.controller] = (ctx.state.flow.drawsThisTurn[ctx.controller] ?? 0) + 1
  emitEvent(ctx.state, 'onCardDrawn' as any, ctx.controller, 'spellbook')
  // don't name the drawn card in the shared log (it's a hidden hand card — the
  // controller sees it in hand with the caster-lock badge; naming it would leak)
  pushLog(ctx.state, ctx.controller, `A spell is drawn — only ${label} may cast it.`)
}
