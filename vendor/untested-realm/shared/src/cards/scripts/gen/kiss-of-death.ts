import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'

// 'May be cast by Spirits and Undead. / Kill target minion here.'
registerScript('Kiss of Death', {
  // EXPANSION arm: adds Spirits/Undead (the avatar & Spellcasters keep the normal path).
  casterFilter: (state, caster) => {
    const st = effSubtypes(state, caster)
    return st.includes('Spirit') || st.includes('Undead') ? null : 'Only Spirits and Undead may cast Kiss of Death.'
  },
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'here', label: 'target minion here' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('unit' in t) ctx.kill(t.unit)
  },
})
