import { registerScript } from '../registry'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'Air and Water Spellcaster / Genesis → Disable target adjacent unit until your next turn.'
registerScript('Frost Elemental', {
  genesisTargets: [{ what: 'unit', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent unit' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) disableUntilYourNextTurn(ctx.state, t.unit, ctx.controller)
  },
})
