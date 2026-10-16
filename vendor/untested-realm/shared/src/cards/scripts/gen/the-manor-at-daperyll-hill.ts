import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

/** enemy units standing at the Manor (the site's controller is the one who feeds) */
function preyAt(state: GameState, siteId: string): string[] {
  const self = state.sites[siteId]
  if (!self) return []
  return unitsAt(state, self.x, self.y).filter((u) => u.controller !== self.controller).map((u) => u.id)
}

// '(A)(A)(A)(A) — Once on your turn, this may deal 3 damage to target enemy
//  here to heal you 3.'
registerScript('The Manor at Daperyll Hill', {
  abilities: [{
    key: 'feast',
    label: '3 damage to an enemy here → heal 3',
    cost: {},
    threshold: { air: 4 },
    oncePerTurn: true,
    // nothing to feed on → not offered (it would spend the once-per-turn and log a heal that never happens)
    available: (state, sourceId) => preyAt(state, sourceId).length > 0,
    effect: (ctx) => {
      const prey = preyAt(ctx.state, ctx.sourceId)
      if (!prey.length) return ctx.log('No enemy dines at the Manor.')
      ctx.ask({ kind: 'chooseTargets', title: 'The Manor feeds on whom?', data: { candidates: prey, count: 1, upTo: false, kind: 'unit' } }, 'feast')
    },
  }],
  conts: {
    feast: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && ctx.state.units[id]) {
        ctx.dealDamage({ unit: id }, 3)
        ctx.gainLife(ctx.controller, 3)
      }
    },
  },
})
