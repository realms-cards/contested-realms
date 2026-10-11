import { registerScript } from '../registry'
import { GRID_H, GRID_W, siteAt, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import type { GameState } from '../../../engine/types'

// 'Flame Wave flows horizontally, from one edge of the realm to the other. [7 5 3 1 per row]'
const FLAME_WAVE_DMG = [7, 5, 3, 1]

/** the sited squares of the four columns from the chosen edge, with their damage */
function flameWaveCells(state: GameState, edge: 'west' | 'east'): { x: number; y: number; dmg: number }[] {
  const out: { x: number; y: number; dmg: number }[] = []
  for (let i = 0; i < FLAME_WAVE_DMG.length; i++) {
    const x = edge === 'west' ? i : GRID_W - 1 - i
    for (let y = 0; y < GRID_H; y++) {
      if (!siteAt(state, x, y)) continue
      out.push({ x, y, dmg: FLAME_WAVE_DMG[i] })
    }
  }
  return out
}

registerScript('Flame Wave', {
  areaDamage: (state, _casterId, params) => (params.edge ? flameWaveCells(state, params.edge) : null),
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Flame Wave starts from which edge?', data: { options: ['west', 'east'] } }, 'wave')
  },
  conts: {
    wave: (ctx, _c, edge) => {
      for (const cell of flameWaveCells(ctx.state, edge as 'west' | 'east')) {
        for (const u of unitsAt(ctx.state, cell.x, cell.y, 'surface')) ctx.dealDamage({ unit: u.id }, cell.dmg)
      }
      pushLog(ctx.state, ctx.controller, '🔥 A wall of flame sweeps the realm!')
    },
  },
})
