import { registerScript } from '../registry'
import { Cell, Dir, applyGrid, resolveCells } from '../multi-card-utils/apply-grid'

// 'Choose a direction from the caster. Deal damage to each unit at a location in
// the area of effect:  [1 1 1 1 / 3 3 3 / 5 / ●]'
function coneOfFlameCells(lean: 'left' | 'right'): Cell[] {
  const wideRow = lean === 'left' ? [-2, -1, 0, 1] : [-1, 0, 1, 2]
  return [
    { dx: 0, dy: 1, dmg: 5 },
    { dx: -1, dy: 2, dmg: 3 }, { dx: 0, dy: 2, dmg: 3 }, { dx: 1, dy: 2, dmg: 3 },
    ...wideRow.map((dx) => ({ dx, dy: 3, dmg: 1 })),
  ]
}

registerScript('Cone of Flame', {
  areaDamage: (state, casterId, params) => {
    const caster = state.units[casterId]
    if (!caster || !params.direction || !params.lean) return null
    return resolveCells(state, caster, coneOfFlameCells(params.lean), params.direction)
  },
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Cone of Flame: which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'aim')
  },
  conts: {
    aim: (ctx, _c, dir) => {
      if (!dir) return
      ctx.ask({ kind: 'chooseOption', title: 'The wide edge leans which way?', data: { options: ['left', 'right'] } }, 'lean', { dir })
    },
    lean: (ctx, contCtx, lean) => {
      const caster = ctx.caster!
      applyGrid(ctx, caster, coneOfFlameCells(lean as 'left' | 'right'), contCtx.dir as Dir)
    },
  },
})
