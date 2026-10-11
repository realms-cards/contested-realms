import { registerScript } from '../registry'

// 'Once on your turn, may fly to a wounded minion.'
registerScript('Vesper Swarm', {
  abilities: [{
    key: 'scent',
    label: 'Fly to a wounded minion',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const wounded = Object.values(ctx.state.units).filter((u) => !u.isAvatar && u.damage > 0 && u.id !== ctx.sourceId).map((u) => u.id)
      if (!wounded.length) return ctx.log('No blood on the wind.')
      ctx.ask({ kind: 'chooseTargets', title: 'The swarm scents whom?', data: { candidates: wounded, count: 1, upTo: false, kind: 'unit' } }, 'descend')
    },
  }],
  conts: {
    descend: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const prey = typeof id === 'string' ? ctx.state.units[id] : null
      if (self && prey) ctx.teleport(self.id, prey.x, prey.y, prey.region === 'surface' ? 'surface' : self.region)
    },
  },
})
