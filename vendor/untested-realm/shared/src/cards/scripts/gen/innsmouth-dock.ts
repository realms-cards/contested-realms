import { registerScript } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'
import { isLegalStep, takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'

// 'Once on your turn, you may lure an adjacent minion to step here.'
// Codex (Phrases that are Synonymous): "'Lure' requires the unit to take the step themselves" — its own
// step (takeOwnStep): an Immobile minion stays, while "can't be moved by force" and Old Salt Anchorman
// (FAQ: lures aren't stopped) don't hold it back.
registerScript('Innsmouth Dock', {
  abilities: [{
    key: 'lure',
    label: 'Lure an adjacent minion here',
    cost: {},
    oncePerTurn: true,
    targets: [{ what: 'minion', count: 1, targeted: false, where: 'anywhere', label: 'an adjacent minion' }],
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (!u) return
      if (!adjacentSquaresW(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y) || (u.x === self.x && u.y === self.y)) {
        return ctx.log('Not adjacent.')
      }
      // "step here" is a STEP: an Immobile minion, or one blocked by a wall / entry-ban, can't be lured.
      const from = { x: u.x, y: u.y, region: u.region }
      const to = { x: self.x, y: self.y, region: 'surface' as const }
      if (!isLegalStep(ctx.state, u, from, to)) return ctx.log("It can't step here.")
      takeOwnStep(ctx.state, u, to)
      checkStateBased(ctx.state)
    },
  }],
})
