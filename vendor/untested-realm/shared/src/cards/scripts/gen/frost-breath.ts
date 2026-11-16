import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'
import { unitsAt } from '../../../engine/grid'
import { runDamageEvent } from '../../../engine/effects'
import { Cell, Dir, applyGrid, resolveCells } from '../multi-card-utils/apply-grid'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'May be cast by a Beast or Spirit. Each unit at affected locations takes damage and is disabled until
// your next turn. [1 / 1 2 1 / ●]' — the printed pattern (as Firebreathing's): 2 straight ahead, 1 to
// either side of it, 1 two steps ahead. As the FAQ rules for Frostbolt/Hailstriker, the damage and the
// disable are simultaneous: every unit hit is disabled before the deaths settle, so a slain minion fires no
// Deathrite.
const FROST_BREATH_CELLS: Cell[] = [
  { dx: -1, dy: 1, dmg: 1 }, { dx: 0, dy: 1, dmg: 2 }, { dx: 1, dy: 1, dmg: 1 },
  { dx: 0, dy: 2, dmg: 1 },
]

registerScript('Frost Breath', {
  // EXPANSION arm: adds Beasts and Spirits (the avatar & Spellcasters keep the normal path)
  casterFilter: (state, caster) => {
    const st = effSubtypes(state, caster)
    return st.includes('Beast') || st.includes('Spirit') ? null : 'Only a Beast or Spirit may cast Frost Breath.'
  },
  areaDamage: (state, casterId, params) => {
    const caster = state.units[casterId]
    if (!caster || !params.direction) return null
    return resolveCells(state, caster, FROST_BREATH_CELLS, params.direction)
  },
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Breathe frost in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'breath')
  },
  conts: {
    breath: (ctx, _c, dir) => {
      const caster = ctx.caster
      if (!dir || !caster) return
      runDamageEvent(ctx.state, () => {
        applyGrid(ctx, caster, FROST_BREATH_CELLS, dir as Dir)
        for (const cell of resolveCells(ctx.state, caster, FROST_BREATH_CELLS, dir as Dir)) {
          for (const u of unitsAt(ctx.state, cell.x, cell.y, caster.region)) disableUntilYourNextTurn(ctx, u.id)
        }
      })
    },
  },
})
