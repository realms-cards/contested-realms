import { registerScript } from '../registry'
import { GRID_H, GRID_W } from '../../../engine/grid'

// 'Voidwalk. Must be cast to a corner. / Deathrite → Return to hand.'
registerScript('The Ninth Legion', {
  summonAnywhere: true,
  summonFilter: (_state, _player, at) =>
    (at.x === 0 || at.x === GRID_W - 1) && (at.y === 0 || at.y === GRID_H - 1) ? null : 'The Ninth Legion marches in only at a corner.',
  deathrite: (ctx) => ctx.bounce(ctx.sourceId),
})
