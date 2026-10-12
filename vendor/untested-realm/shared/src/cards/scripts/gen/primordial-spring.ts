import { registerScript } from '../registry'

// 'Genesis → If you control fewer sites than any opponent, draw three sites.'
registerScript('Primordial Spring', {
  genesis: (ctx) => {
    const mine = Object.values(ctx.state.sites).filter((s) => s.controller === ctx.controller && !s.isRubble).length
    const theirs = Object.values(ctx.state.sites).filter(
      (s) => s.controller !== null && s.controller !== ctx.controller && !s.isRubble,
    ).length
    if (mine < theirs) ctx.draw(ctx.controller, 'atlas', 3)
  },
})
