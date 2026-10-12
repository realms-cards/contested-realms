import { registerScript } from '../registry'
import { inBounds } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import { Dir, applyGrid, resolveCells, rot } from '../multi-card-utils/apply-grid'

// 'Place the cross anywhere in the realm. Banish Evil and damage units occupying
// affected squares: [3 above / 3 7 3 / 3 / 3 below-below] — rotatable (FAQ)'
const DAY_OF_JUDGMENT_CELLS = [
  { dx: 0, dy: 0, dmg: 7 },
  { dx: 0, dy: 1, dmg: 3 },
  { dx: -1, dy: 0, dmg: 3 }, { dx: 1, dy: 0, dmg: 3 },
  { dx: 0, dy: -1, dmg: 3 }, { dx: 0, dy: -2, dmg: 3 },
]

/** the whole cross must fit inside the realm (FAQ) */
function dayOfJudgmentFits(origin: { x: number; y: number }, dir: Dir): boolean {
  return DAY_OF_JUDGMENT_CELLS.every((cell) => {
    const r = rot(dir, cell.dx, cell.dy)
    return inBounds(origin.x + r.dx, origin.y + r.dy)
  })
}

registerScript('Day of Judgment', {
  areaDamage: (state, _casterId, params) => {
    if (!params.at || !params.direction) return null
    if (!dayOfJudgmentFits(params.at, params.direction)) return null
    return resolveCells(state, params.at, DAY_OF_JUDGMENT_CELLS, params.direction)
  },
  targets: [{ what: 'square', count: 1, targeted: false, label: 'the heart of the cross' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    ctx.ask({ kind: 'chooseOption', title: 'The cross points which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'judge', { origin: t.square })
  },
  conts: {
    judge: (ctx, contCtx, dir) => {
      if (!dir) return
      if (!dayOfJudgmentFits(contCtx.origin, dir as Dir)) return ctx.log('The cross must fit entirely within the realm.')
      applyGrid(ctx, contCtx.origin, DAY_OF_JUDGMENT_CELLS, dir as Dir, { region: 'allRegions', banishEvil: true })
      pushLog(ctx.state, ctx.controller, '✝ The Day of Judgment is upon us.')
    },
  },
})
