import { registerScript, type EffectAPI } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { pushLog, emitUnitMoved } from '../../../engine/effects'
import { enterSite } from '../../../engine/casting'

// 'Tap → Reveal and play your topmost site to an adjacent void or Rubble.
//  Frontier Settlers move there and lose this ability.'
registerScript('Frontier Settlers', {
  abilities: [{
    key: 'settle',
    label: 'Tap → Settle the frontier (play topmost site adjacent)',
    cost: { tap: true },
    // "lose this ability" — once they've settled, the ability is GONE: hidden in the UI and rejected by
    // canActivate, not merely a no-op (otherwise a second click wastes the tap on an ability that does nothing).
    available: (state, sourceId) => !state.units[sourceId]?.counters?.settled,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || self.counters?.settled) return
      const p = ctx.state.players[ctx.controller]
      if (p.atlas[0] === undefined) return ctx.log('The atlas is empty.')
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

// Play the topmost atlas site at `spot`, then drag the Settlers onto it; they lose this ability afterward.
function settleFrontier(ctx: EffectAPI, spot: { x: number; y: number }) {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || self.counters?.settled) return
  const p = ctx.state.players[ctx.controller]
  const topId = p.atlas[0]
  if (topId === undefined) return ctx.log('The atlas is empty.')
  const existing = siteAt(ctx.state, spot.x, spot.y)
  if (existing?.isRubble) delete ctx.state.sites[existing.id] // build over any rubble (one site per square)
  p.atlas.shift()
  pushLog(ctx.state, ctx.controller, `The Settlers found ${ctx.state.cards[topId].name}.`)
  // Route through enterSite — NOT a raw insert — so the played site's Genesis fully runs, along with its
  // printed Ward, the mana it provides, void-lift and onSitePlayed. (The old raw insert fired no Genesis and
  // hand-faked the mana as a flat +1; enterSite provides the site's real mana.)
  enterSite(ctx.state, ctx.controller, topId, spot.x, spot.y)
  // "move there" is a STEP — an Immobile Settlers (or one blocked by a wall / entry-ban) plays the site but
  // can't move onto it. Evaluated AFTER enterSite so the new site's Genesis (e.g. Quagmire) resolved first.
  // Re-fetch in case that Genesis removed the Settlers.
  const alive = ctx.state.units[self.id]
  if (alive) {
    const from = { x: alive.x, y: alive.y, region: alive.region }
    const to = { x: spot.x, y: spot.y, region: 'surface' as const }
    if (isLegalStep(ctx.state, alive, from, to)) { alive.x = spot.x; alive.y = spot.y; alive.region = 'surface'; emitUnitMoved(ctx.state, alive, from) }
    alive.counters = { ...alive.counters, settled: 1 }
  }
}
