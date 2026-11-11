import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, placeRubble } from '../../../engine/effects'
import { adjacentSquaresW, orthAdjacentWrapped, siteAt } from '../../../engine/grid'
import { playTopAtlasOntoRubble } from '../multi-card-utils/atlas-onto-rubble'

// (Necromancer scripted in m7; Avatar of Air, Avatar of Water in m1; Druid in m9.)

// 'Tap → Play or draw a site. If you played an earth site, fill a void adjacent
//  to you with Rubble. / Tap → Replace an adjacent Rubble with the topmost site
//  of your atlas.'
function geomancerFill(ctx: EffectAPI, sq: { x: number; y: number } | null | undefined) {
  if (!sq || siteAt(ctx.state, sq.x, sq.y)) return
  placeRubble(ctx.state, sq.x, sq.y, ctx.controller)
  pushLog(ctx.state, ctx.controller, 'The earth heaves up a spur of Rubble.')
}

function geomancerReclaim(ctx: EffectAPI, sq: { x: number; y: number } | null | undefined) {
  const self = ctx.state.units[ctx.sourceId]
  const p = ctx.state.players[ctx.controller]
  const rubble = sq ? siteAt(ctx.state, sq.x, sq.y) : null
  if (!self || !rubble || !rubble.isRubble || !p.atlas.length) return
  if (!adjacentSquaresW(ctx.state, self.x, self.y).some((s) => s.x === rubble.x && s.y === rubble.y)) return
  playTopAtlasOntoRubble(ctx, rubble.id)
}

// An earth site is one that provides (E). A Bloom provides its Genesis thresholds the turn it comes
// down, so Desert Bloom (Genesis → Provides (A)(E)(W) this turn) is an earth site as it is played.
function isEarthSiteAsPlayed(name: string): boolean {
  const card = getCard(name)
  return card.thresholds.earth > 0 || /Genesis\s*→\s*Provides[^.]*\(E\)[^.]*this turn/.test(card.text ?? '')
}

registerScript('Geomancer', {
  afterAvatarSitePlay: (ctx, siteId) => {
    const self = ctx.state.units[ctx.sourceId]
    const site = ctx.state.sites[siteId]
    if (!self || !site || !isEarthSiteAsPlayed(site.name)) return
    const voids = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => !siteAt(ctx.state, s.x, s.y))
    if (!voids.length) return
    // Only one void to fill → place it automatically, no prompt.
    if (voids.length === 1) return geomancerFill(ctx, voids[0])
    ctx.ask({ kind: 'chooseSquare', title: 'Geomancer: fill which adjacent void with Rubble?', data: { squares: voids } }, 'fill')
  },
  abilities: [{
    key: 'reclaim',
    label: 'Replace adjacent Rubble with topmost atlas site',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!self || !p.atlas.length) return ctx.log('Your atlas is empty.')
      // "adjacent" includes the Geomancer's own square (Codex Adjacent): the Rubble he stands on qualifies
      const adj = adjacentSquaresW(ctx.state, self.x, self.y)
      const rubble = Object.values(ctx.state.sites).filter(
        (s) => s.isRubble && adj.some((a) => a.x === s.x && a.y === s.y),
      )
      if (!rubble.length) return ctx.log('No adjacent Rubble.')
      // Only one adjacent Rubble → reclaim it automatically, no prompt.
      if (rubble.length === 1) return geomancerReclaim(ctx, { x: rubble[0].x, y: rubble[0].y })
      ctx.ask({ kind: 'chooseSquare', title: 'Reclaim which Rubble?', data: { squares: rubble.map((s) => ({ x: s.x, y: s.y })) } }, 'reclaim')
    },
  }],
  conts: {
    fill: (ctx, _c, sq) => geomancerFill(ctx, sq),
    reclaim: (ctx, _c, sq) => geomancerReclaim(ctx, sq),
  },
})
