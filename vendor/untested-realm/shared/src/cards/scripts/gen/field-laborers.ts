import { registerScript } from '../registry'

// 'Tap → Gain (2) this turn.'
registerScript('Field Laborers', {
  abilities: [{
    key: 'toil',
    label: 'Tap → Gain ②',
    cost: { tap: true },
    effect: (ctx) => {
      ctx.gainMana(2) // +2 floats over the Laborers
    },
  }],
})
