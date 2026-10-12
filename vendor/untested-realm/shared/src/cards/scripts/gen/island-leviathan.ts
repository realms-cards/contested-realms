import { registerScript } from '../registry'
import { transformSite } from '../multi-card-utils/transform-site'

// '(W)×8 — May transform into a Monster. Place flooded Rubble underneath.'
registerScript('Island Leviathan', {
  selfSubtypes: (_state, _unit, st) => (st.includes('Monster') ? st : [...st, 'Monster']),
  abilities: [{
    key: 'leviathan:wake',
    label: 'Transform into a Monster (flooded Rubble underneath)',
    cost: {},
    threshold: { water: 8 },
    effect: (ctx) => transformSite(ctx, true),
  }],
})
