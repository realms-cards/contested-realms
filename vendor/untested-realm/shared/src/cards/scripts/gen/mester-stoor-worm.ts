import { registerScript } from '../registry'
import { Cell, Dir, applyGrid } from '../multi-card-utils/apply-grid'

// 'Tap → Choose a direction. Deal LETHAL damage: [1 / 1 1 1 / ●]'
registerScript('Mester Stoor Worm', {
  abilities: [{
    key: 'tide',
    label: 'Tap → Tidal breath (lethal)',
    cost: { tap: true },
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'The Worm surges in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'surge')
    },
  }],
  conts: {
    surge: (ctx, _c, dir) => {
      if (!dir) return
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const cells: Cell[] = [
        { dx: -1, dy: 1, dmg: 1 }, { dx: 0, dy: 1, dmg: 1 }, { dx: 1, dy: 1, dmg: 1 },
        { dx: 0, dy: 2, dmg: 1 },
      ]
      applyGrid(ctx, self, cells, dir as Dir, { skipUnitId: self.id, lethal: true })
    },
  },
})
