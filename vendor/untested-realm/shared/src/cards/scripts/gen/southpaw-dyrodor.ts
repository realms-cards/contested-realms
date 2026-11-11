import { registerScript } from '../registry'
import { applyGrid, type Cell } from '../multi-card-utils/apply-grid'

// 'Tap → Dyrodor swings its tail left to right, dealing damage to each unit at affected locations: 4 to the
// location on its left, 3 to the location above-left, 2 to the location above, and 1 to the location
// above-right (relative to Dyrodor's controller).'
// Seen from its controller's seat: "above" is toward the opponent (forward: +y for player 0, -y for
// player 1, as the board is drawn for each) and "left" is the controller's left (-x for player 0, +x for
// player 1). The swing stays in Dyrodor's region.
function tailCells(controller: 0 | 1): Cell[] {
  const up = controller === 0 ? 1 : -1
  const left = controller === 0 ? -1 : 1
  return [
    { dx: left, dy: 0, dmg: 4 },
    { dx: left, dy: up, dmg: 3 },
    { dx: 0, dy: up, dmg: 2 },
    { dx: -left, dy: up, dmg: 1 },
  ]
}

registerScript('Southpaw Dyrodor', {
  abilities: [{
    key: 'tail',
    label: 'Swing its tail (4 / 3 / 2 / 1, left to right)',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      applyGrid(ctx, { x: self.x, y: self.y }, tailCells(self.controller), 'n', { region: self.region })
    },
  }],
})
