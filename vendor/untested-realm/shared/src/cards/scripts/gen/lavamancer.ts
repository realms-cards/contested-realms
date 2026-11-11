import { registerScript, type EffectAPI } from '../registry'
import { GRID_H, GRID_W, nearbySquaresW, unitsAt } from '../../../engine/grid'
import { placeRubble } from '../../../engine/effects'
import type { GameState } from '../../../engine/types'
import { riftShifts, pullApart } from '../multi-card-utils/rift-entry'

// 'Tap → Play or draw a site. / (E)(E)(F)(F), (3) → Pull apart a partial row or column, filling the
// resulting void with Rubble that deals 1 damage to minions near it.'
// The same pull as Rift Valley: the sites from the chosen square to the end of their partial row or
// column slide one square outward into the void beyond it, with everything on them, and the square left
// behind fills with Rubble. Then each minion nearby that Rubble takes 1 — on or below a nearby site, never
// in a void (a site's locations are its surface and subsurface).
function pullSquares(state: GameState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (riftShifts(state, x, y).length) out.push({ x, y })
  return out
}

function erupt(ctx: EffectAPI, x: number, y: number, label: string): void {
  const shift = riftShifts(ctx.state, x, y).find((s) => s.label === label)
  if (!shift) return
  pullApart(ctx.state, ctx.controller, shift)
  placeRubble(ctx.state, x, y, ctx.controller)
  ctx.log(`🌋 The land is pulled apart — Rubble boils up at (${x + 1},${y + 1})!`)
  // 1 to each minion once, however many of its squares are nearby
  const near = new Set<string>()
  for (const sq of nearbySquaresW(ctx.state, x, y)) {
    for (const u of unitsAt(ctx.state, sq.x, sq.y)) if (!u.isAvatar && u.region !== 'void') near.add(u.id)
  }
  for (const id of near) ctx.dealDamage({ unit: id }, 1)
}

function askDirection(ctx: EffectAPI, sq: { x: number; y: number }): void {
  const shifts = riftShifts(ctx.state, sq.x, sq.y)
  if (shifts.length === 1) return erupt(ctx, sq.x, sq.y, shifts[0].label)
  if (shifts.length > 1) {
    ctx.ask({ kind: 'chooseOption', title: 'Lavamancer: pull the land apart which way?', data: { options: shifts.map((s) => s.label) } }, 'direction', { x: sq.x, y: sq.y })
  }
}

registerScript('Lavamancer', {
  abilities: [{
    key: 'rift',
    label: 'Pull apart a partial row or column (Rubble, 1 damage nearby)',
    cost: { mana: 3 },
    threshold: { earth: 2, fire: 2 },
    available: (state) => pullSquares(state).length > 0,
    effect: (ctx) => {
      const squares = pullSquares(ctx.state)
      if (squares.length === 1) return askDirection(ctx, squares[0])
      if (squares.length > 1) ctx.ask({ kind: 'chooseSquare', title: 'Lavamancer: where does the land split? (the Rubble fills this square)', data: { squares } }, 'seam')
    },
  }],
  conts: {
    seam: (ctx, _c, sq) => {
      if (sq && pullSquares(ctx.state).some((s) => s.x === sq.x && s.y === sq.y)) askDirection(ctx, sq)
    },
    direction: (ctx, c, choice) => {
      if (typeof choice === 'string') erupt(ctx, c.x as number, c.y as number, choice)
    },
  },
})
