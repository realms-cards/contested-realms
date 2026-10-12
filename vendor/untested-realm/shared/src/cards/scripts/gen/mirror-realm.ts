import { registerScript, getScript, type EffectAPI } from '../registry'
import { pushLog, makeCtx } from '../../../engine/effects'
import { nearbySquaresW, siteAt, GRID_W, GRID_H } from '../../../engine/grid'
import { siteLegalAt } from '../../../engine/casting'
import { riftShifts, riftEntry } from '../multi-card-utils/rift-entry'
import type { GameState, PlayerId, SiteState } from '../../../engine/types'

// 'This site enters the realm as a copy of another nearby site.'
//
// Mirror Realm reflects a NEARBY site — but a copy is only lawful where the copied site could
// itself be played. So it can't become a Cornerstone unless it sits in a corner, nor an Edge of
// the World off a void edge, etc. Conversely it may ENTER anywhere a copyable nearby site would be
// allowed (a corner for a Cornerstone, the seam of a Rift Valley, …), not just the standard
// site-adjacent squares. "Nearby" is Magellan-aware (nearbySquaresW wraps the joined edges).
//
// copyTargets does both jobs: it drives Mirror Realm's own placement legality (which squares it may
// enter) and the genesis reflect choices (which sites it may become at the square it landed on).
function copyTargets(state: GameState, player: PlayerId, x: number, y: number, selfId?: string): SiteState[] {
  const out: SiteState[] = []
  for (const s of nearbySquaresW(state, x, y)) {
    const site = siteAt(state, s.x, s.y)
    if (!site || site.isRubble || site.id === selfId || out.some((o) => o.id === site.id)) continue
    // the reflected site's OWN placement rule must permit Mirror Realm's square (treated as empty)
    if (siteLegalAt(state, player, site.name, { x, y }, selfId)) out.push(site)
  }
  return out
}

function reflectInto(ctx: EffectAPI, self: SiteState, model: SiteState): void {
  self.name = model.name
  pushLog(ctx.state, ctx.controller, `The Mirror Realm becomes a perfect image of ${model.name}.`)
  const g = getScript(model.name)?.genesis
  if (g) g(makeCtx(ctx.state, self.id, ctx.controller, []))
}

registerScript('Mirror Realm', {
  // ADD any EMPTY square where some copyable NEARBY site could legally be played (a corner for a
  // Cornerstone, a void edge for an Edge of the World, …); otherwise fall through to standard site
  // placement. Mirror Realm is a normal site too, so it can still be played to any ordinary square
  // even with nothing to copy — it just fizzles into a blank Mirror Realm. (It must stay playable:
  // e.g. a Pathfinder's forced first-turn establishment can't be declined.)
  sitePlacement: (state, player, at) => (copyTargets(state, player, at.x, at.y).length ? 'allow' : null),
  // …and may also enter "the special way" of a nearby Rift Valley: the pull-apart seams, so it can
  // reflect a Rift Valley by opening the land like one (FAQ). Offer a seam only when a Rift Valley is
  // nearby it to copy; the pull-apart runs via customSitePlay, then genesis reflects at the landing.
  extraSiteSquares: (state) => {
    const rifts = Object.values(state.sites).filter((s) => !s.isRubble && s.name === 'Rift Valley')
    if (!rifts.length) return []
    const out: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) {
      for (let y = 0; y < GRID_H; y++) {
        if (!riftShifts(state, x, y).length) continue
        const near = nearbySquaresW(state, x, y)
        if (rifts.some((r) => near.some((n) => n.x === r.x && n.y === r.y))) out.push({ x, y })
      }
    }
    return out
  },
  customSitePlay: (state, player, cardId, x, y) => riftEntry(state, player, cardId, x, y),
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const models = copyTargets(ctx.state, ctx.controller, self.x, self.y, self.id)
    if (!models.length) return
    if (models.length === 1) return reflectInto(ctx, self, models[0]) // single lawful reflection — no prompt
    ctx.ask(
      { kind: 'chooseSquare', title: 'Mirror Realm reflects which nearby site?', data: { squares: models.map((s) => ({ x: s.x, y: s.y })) } },
      'reflect',
    )
  },
  conts: {
    reflect: (ctx, _c, sq) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self || !sq) return
      // re-derive lawful targets for the actual square and confirm the pick is among them
      const model = copyTargets(ctx.state, ctx.controller, self.x, self.y, self.id).find((s) => s.x === sq.x && s.y === sq.y)
      if (!model) return
      reflectInto(ctx, self, model)
    },
  },
})
