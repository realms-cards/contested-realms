import type { EffectAPI } from '../registry'
import { enterSite } from '../../../engine/casting'
import { getScript } from '../registry'

/** Play the top site of the controller's atlas onto the Rubble `rubbleId` (Geomancer's reclaim, Emberleaf
 *  Dryad). Routed through enterSite (not a raw insert) so the site behaves exactly like a normally-played
 *  one: its printed Ward, the mana it provides, its Genesis, void-lift, and the onSitePlayed event (an
 *  adjacent Boulevard of Bones' Skeleton, Cursed Land) all happen. */
export function playTopAtlasOntoRubble(ctx: EffectAPI, rubbleId: string): boolean {
  const rubble = ctx.state.sites[rubbleId]
  const p = ctx.state.players[ctx.controller]
  if (!rubble || !rubble.isRubble || !p.atlas.length) return false
  const { x, y } = rubble
  // the site's own placement rule still holds (Edge of the World "must always be adjacent to the void")
  const top = ctx.state.cards[p.atlas[0]].name
  if (getScript(top)?.sitePlacement?.(ctx.state, ctx.controller, { x, y }) === 'deny') {
    ctx.log(`${top} can't be played there — it stays on top of the atlas.`)
    return false
  }
  delete ctx.state.sites[rubble.id]
  const cardId = p.atlas.shift()!
  ctx.log(`The Rubble is reshaped into ${ctx.state.cards[cardId].name}.`)
  enterSite(ctx.state, ctx.controller, cardId, x, y)
  return true
}
