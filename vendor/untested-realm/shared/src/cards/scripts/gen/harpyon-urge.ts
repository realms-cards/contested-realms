import { registerScript } from '../registry'
import { avgPow } from '../multi-card-utils/avg-pow'

// 'An ally flies to target weaker minion and strikes it upon arrival.'
registerScript('Harpyon Urge', {
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'your flier' }, // "an ally" — any unit you control, Avatar included
    { what: 'minion', count: 1, targeted: true, label: 'target weaker minion' },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!('unit' in t1) || !('unit' in t2)) return
    const flier = ctx.state.units[t1.unit]
    const prey = ctx.state.units[t2.unit]
    if (!flier || !prey) return
    if (avgPow(ctx.state, prey) >= avgPow(ctx.state, flier)) return ctx.log('The prey is not weaker.')
    // the strike comes "upon arrival": a flight that is refused (Gnome Hollows) strikes nothing
    if (!ctx.teleport(flier.id, prey.x, prey.y, prey.region)) return
    const f = ctx.state.units[flier.id]
    if (f && ctx.state.units[prey.id] && f.x === prey.x && f.y === prey.y) ctx.strike(f, { unit: prey.id })
  },
})
