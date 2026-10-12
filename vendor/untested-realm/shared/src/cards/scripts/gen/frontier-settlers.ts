import { registerScript, type EffectAPI } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { pushLog, emitUnitMoved } from '../../../engine/effects'

// 'Tap â†’ Reveal and play your topmost site to an adjacent void or Rubble.
// Frontier Settlers move there and lose this ability.'
registerScript('Frontier Settlers', {
  abilities: [{
    key: 'settle',
    label: 'Tap â†’ Settle the frontier (play topmost site adjacent)',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || self.counters?.settled) return
      const p = ctx.state.players[ctx.controller]
      const topId = p.atlas[0]
      if (topId === undefined) return ctx.log('The atlas is empty.')
      const spots = adjacentSquaresW(ctx.state, self.x, self.y).filter((s) => {
        if (s.x === self.x && s.y === self.y) return false
        const existing = siteAt(ctx.state, s.x, s.y)
        return !existing || existing.isRubble
      })
      if (!spots.length) return ctx.log('Nowhere to settle.')
      if (spots.length === 1) return settleFrontier(ctx, spots[0])
      ctx.ask({ kind: 'chooseSquare', title: 'Settle the frontier where?', data: { squares: spots } }, 'settleAt')
    },
  }],
  conts: {
    settleAt: (ctx, _c, choice) => {
      const { x, y } = choice ?? {}
      if (x === undefined) return
      settleFrontier(ctx, { x, y })
    },
  },
})

// place the topmost site at `spot` (deletes any Rubble), grant +1 mana, drag the Settlers on.
function settleFrontier(ctx: EffectAPI, spot: { x: number; y: number }) {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || self.counters?.settled) return
  const p = ctx.state.players[ctx.controller]
  const topId = p.atlas[0]
  if (topId === undefined) return ctx.log('The atlas is empty.')
  const existing = siteAt(ctx.state, spot.x, spot.y)
  if (existing?.isRubble) delete ctx.state.sites[existing.id]
  p.atlas.shift()
  const siteId = `s${ctx.state.nextId++}`
  ctx.state.sites[siteId] = {
    id: siteId, cardId: topId, name: ctx.state.cards[topId].name, owner: ctx.controller,
    controller: ctx.controller, x: spot.x, y: spot.y, tapped: false, isRubble: false,
  }
  p.mana += 1
  // "move there" is a STEP — an Immobile Settlers (or one blocked by a wall / entry-ban) plays the site
  // but can't move onto it. (Silenced/disabled Settlers can't reach here at all — the ability is gone.)
  const from = { x: self.x, y: self.y, region: self.region }
  const to = { x: spot.x, y: spot.y, region: 'surface' as const }
  if (isLegalStep(ctx.state, self, from, to)) { self.x = spot.x; self.y = spot.y; self.region = 'surface'; emitUnitMoved(ctx.state, self, from) }
  self.counters = { ...self.counters, settled: 1 }
  pushLog(ctx.state, ctx.controller, `The Settlers found ${ctx.state.cards[topId].name}.`)
}
