import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { enterSite } from '../../../engine/casting'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'

// (Necromancer scripted in m7; Avatar of Air, Avatar of Water in m1; Druid in m9.)

// 'Tap → Play or draw a site. If you played an earth site, fill a void adjacent
//  to you with Rubble. / Tap → Replace an adjacent Rubble with the topmost site
//  of your atlas.'
function geomancerFill(ctx: EffectAPI, sq: { x: number; y: number } | null | undefined) {
  if (!sq || siteAt(ctx.state, sq.x, sq.y)) return
  const rubbleCardId = `c${ctx.state.nextId++}`
  ctx.state.cards[rubbleCardId] = { id: rubbleCardId, name: 'Rubble', owner: ctx.controller, isToken: true }
  const rubbleId = `s${ctx.state.nextId++}`
  ctx.state.sites[rubbleId] = {
    id: rubbleId, cardId: rubbleCardId, name: 'Rubble', owner: ctx.controller,
    controller: null, x: sq.x, y: sq.y, tapped: false, isRubble: true,
  }
  pushLog(ctx.state, ctx.controller, 'The earth heaves up a spur of Rubble.')
}

function geomancerReclaim(ctx: EffectAPI, sq: { x: number; y: number } | null | undefined) {
  const self = ctx.state.units[ctx.sourceId]
  const p = ctx.state.players[ctx.controller]
  const rubble = sq ? siteAt(ctx.state, sq.x, sq.y) : null
  if (!self || !rubble || !rubble.isRubble || !p.atlas.length) return
  if (!orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === rubble.x && s.y === rubble.y)) return
  const { x, y } = rubble
  delete ctx.state.sites[rubble.id]
  const cardId = p.atlas.shift()!
  pushLog(ctx.state, ctx.controller, `The Rubble is reshaped into ${ctx.state.cards[cardId].name}.`)
  // Route through enterSite (not a raw insert) so the reclaimed site behaves exactly like a
  // normally-played site: its printed Ward, the mana it provides, its Genesis, void-lift, and
  // the onSitePlayed event ALL fire — the last is what makes an adjacent Boulevard of Bones
  // summon its Skeleton (and Cursed Land react), which a raw insert silently skipped.
  enterSite(ctx.state, ctx.controller, cardId, x, y)
}

registerScript('Geomancer', {
  afterAvatarSitePlay: (ctx, siteId) => {
    const self = ctx.state.units[ctx.sourceId]
    const site = ctx.state.sites[siteId]
    if (!self || !site || getCard(site.name).thresholds.earth === 0) return
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
      const adj = orthAdjacentWrapped(ctx.state, self.x, self.y)
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
