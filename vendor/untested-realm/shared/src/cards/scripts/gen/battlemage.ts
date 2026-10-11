import { registerScript } from '../registry'

// 'Whenever Battlemage attacks and kills an enemy, you may draw a spell.'
registerScript('Battlemage', {
  onAttackKill: (ctx) => {
    ctx.ask({ kind: 'yesNo', title: 'Battlemage slew its prey -- draw a spell?' }, 'loot')
  },
  conts: {
    loot: (ctx, _c, choice) => {
      if (choice) ctx.draw(ctx.controller, 'spellbook')
    },
  },
})
