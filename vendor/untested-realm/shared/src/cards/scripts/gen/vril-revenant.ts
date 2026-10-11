import { registerScript } from '../registry'

// 'Voidwalk / ① → Gain +1 power this turn.'
registerScript('Vril Revenant', {
  abilities: [{
    key: 'empower',
    label: '① → +1 power this turn',
    cost: { mana: 1 },
    effect: (ctx) => ctx.addPower(ctx.sourceId, 1, 'endOfTurn'),
  }],
})
