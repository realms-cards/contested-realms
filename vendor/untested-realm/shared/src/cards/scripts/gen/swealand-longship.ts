import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { isWaterSite, orthAdjacentWrapped, siteAt } from '../../../engine/grid'
import { isLegalStep, takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'
import type { GameState, SiteState, UnitState } from '../../../engine/types'

// 'Once on your turn, may move to an adjacent water site.'
// The Longship moves itself one step (isLegalStep + takeOwnStep: walls, entry bans and "enters" triggers
// apply) onto the surface of a water site sharing a border with its square — its own site isn't a move.
// No tap: it's a free move on top of its Move and Attack.

function waterDestinations(state: GameState, self: UnitState): SiteState[] {
  const from = { x: self.x, y: self.y, region: self.region }
  return orthAdjacentWrapped(state, self.x, self.y)
    .map((q) => siteAt(state, q.x, q.y))
    .filter((s): s is SiteState => !!s && isWaterSite(state, s, getCard) &&
      isLegalStep(state, self, from, { x: s.x, y: s.y, region: 'surface' }))
}

function sail(ctx: EffectAPI, siteId: string): void {
  const self = ctx.state.units[ctx.sourceId]
  const site = ctx.state.sites[siteId]
  if (!self || !site || !waterDestinations(ctx.state, self).some((s) => s.id === site.id)) return
  takeOwnStep(ctx.state, self, { x: site.x, y: site.y, region: 'surface' })
  checkStateBased(ctx.state)
}

registerScript('Swealand Longship', {
  abilities: [{
    key: 'sail',
    label: 'Move to an adjacent water site',
    cost: {},
    oncePerTurn: true,
    available: (state, sourceId) => {
      const self = state.units[sourceId]
      return !!self && waterDestinations(state, self).length > 0
    },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const dests = waterDestinations(ctx.state, self)
      if (!dests.length) return ctx.log('No adjacent water site to move to.')
      if (dests.length === 1) return sail(ctx, dests[0].id)
      ctx.ask({ kind: 'chooseTargets', title: 'Sail to which adjacent water site?', data: { candidates: dests.map((s) => s.id), count: 1, upTo: false, kind: 'site' } }, 'sail')
    },
  }],
  conts: {
    sail: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? (choice[0] as string) : (choice as string)
      if (id) sail(ctx, id)
    },
  },
})
