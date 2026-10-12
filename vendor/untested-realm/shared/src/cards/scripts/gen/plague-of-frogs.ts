import { registerScript } from '../registry'

// 'Summon seven Frog tokens.'
// FAQ (most recent ruling): all seven frogs are summoned to a SINGLE location of your
// choice — the swarm lands together, not spread across the board.
registerScript('Plague of Frogs', {
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseSquare', title: 'Plague of Frogs: choose a location for the swarm (all 7 frogs)', data: {} }, 'ribbit', {})
  },
  conts: {
    ribbit: (ctx, _contCtx, choice) => {
      const { x, y } = choice ?? {}
      if (x === undefined) return
      for (let i = 0; i < 7; i++) ctx.summonToken('Frog', ctx.controller, x, y, 'surface')
    },
  },
})
