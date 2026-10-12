import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'

// "At the end of each player's turn, Pendulum of Peril kills all minions at its current
//  location and another adjacent location of that player's choice."
registerScript('Pendulum of Peril', {
  endOfEveryTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    for (const u of unitsAt(ctx.state, art.x, art.y, art.region)) {
      if (!u.isAvatar) ctx.kill(u.id)
    }
    // only prompt when the choice can matter
    const hasVictims = adjacentSquaresW(ctx.state, art.x, art.y).some(
      (sq) => !(sq.x === art.x && sq.y === art.y) && unitsAt(ctx.state, sq.x, sq.y, art.region).some((u) => !u.isAvatar),
    )
    if (!hasVictims) return
    ctx.ask(
      { kind: 'chooseSquare', title: 'Pendulum of Peril: choose another adjacent location to devastate', player: ctx.state.activePlayer },
      'swing',
    )
  },
  conts: {
    swing: (ctx, contCtx, choice) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art || !choice || typeof choice.x !== 'number') return
      const ok = adjacentSquaresW(ctx.state, art.x, art.y).some((s) => s.x === choice.x && s.y === choice.y)
        && !(choice.x === art.x && choice.y === art.y)
      if (!ok) {
        // the choice is mandatory — ask again until an adjacent square is picked
        ctx.ask(
          { kind: 'chooseSquare', title: 'Choose an ADJACENT location (not the Pendulum\'s own square).', player: ctx.state.activePlayer },
          'swing',
        )
        return
      }
      for (const u of unitsAt(ctx.state, choice.x, choice.y, art.region)) {
        if (!u.isAvatar) ctx.kill(u.id)
      }
    },
  },
})
