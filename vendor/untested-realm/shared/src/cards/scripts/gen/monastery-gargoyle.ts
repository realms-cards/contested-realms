import { registerScript, type EffectAPI } from '../registry'

// 'At the start and end of your turn, choose whether Monastery Gargoyle has
//  Airborne or is a Monument.'
registerScript('Monastery Gargoyle', {
  selfKeywords: (_state, self) => (self.counters?.gargoyleStone ? [] : ['airborne']),
  selfSubtypes: (_state, self, printed) =>
    self.counters?.gargoyleStone ? [...printed.filter((s) => s !== 'Monument'), 'Monument'] : printed,
  startOfTurn: (ctx) => gargoylePose(ctx),
  endOfTurn: (ctx) => gargoylePose(ctx),
  conts: {
    pose: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof choice !== 'string') return
      if (choice.includes('Monument')) self.counters = { ...self.counters, gargoyleStone: 1 }
      else if (self.counters) delete self.counters.gargoyleStone
    },
  },
})

function gargoylePose(ctx: EffectAPI): void {
  if (!ctx.state.units[ctx.sourceId]) return
  ctx.ask({ kind: 'chooseOption', title: 'The Gargoyle…', data: { options: ['spreads its wings (Airborne)', 'turns to stone (Monument)'] } }, 'pose')
}
