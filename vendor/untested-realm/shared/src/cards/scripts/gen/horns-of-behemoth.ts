import { registerScript } from '../registry'
import { transformSite } from '../multi-card-utils/transform-site'

// '(F)(F)(F)(F)(F)(F) — May transform into a Demon. Place Rubble underneath.'
registerScript('Horns of Behemoth', {
  selfSubtypes: (_state, _unit, st) => (st.includes('Demon') ? st : [...st, 'Demon']),
  abilities: [{
    key: 'behemoth:wake',
    label: 'Transform into a Demon (Rubble underneath)',
    cost: {},
    threshold: { fire: 6 },
    effect: (ctx) => transformSite(ctx, false),
  }],
})
