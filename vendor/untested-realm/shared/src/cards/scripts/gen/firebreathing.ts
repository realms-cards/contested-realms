import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'
import { Cell, Dir, applyGrid, resolveCells } from '../multi-card-utils/apply-grid'

// 'May be cast by an allied Beast or Dragon. [1 / 1 4 1 / ●]'
const FIREBREATHING_CELLS: Cell[] = [
  { dx: -1, dy: 1, dmg: 1 }, { dx: 0, dy: 1, dmg: 4 }, { dx: 1, dy: 1, dmg: 1 },
  { dx: 0, dy: 2, dmg: 1 },
]

registerScript('Firebreathing', {
  // EXPANSION arm: adds Beasts/Dragons (the avatar & Spellcasters keep the normal path).
  casterFilter: (state, caster) => {
    const st = effSubtypes(state, caster)
    return st.includes('Beast') || st.includes('Dragon') ? null : 'Only an allied Beast or Dragon may cast Firebreathing.'
  },
  areaDamage: (state, casterId, params) => {
    const caster = state.units[casterId]
    if (!caster || !params.direction) return null
    return resolveCells(state, caster, FIREBREATHING_CELLS, params.direction)
  },
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Breathe fire in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'breath')
  },
  conts: {
    breath: (ctx, _c, dir) => {
      if (!dir) return
      applyGrid(ctx, ctx.caster!, FIREBREATHING_CELLS, dir as Dir)
    },
  },
})
