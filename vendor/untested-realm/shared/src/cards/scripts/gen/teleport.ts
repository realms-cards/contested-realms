import { registerScript } from '../registry'

// 'Teleport an ally to the surface of target site.'
registerScript('Teleport', {
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' },
    { what: 'site', count: 1, targeted: true, label: 'target site' },
  ],
  onCast: (ctx) => {
    const [tu, ts] = ctx.targets
    if ('unit' in tu && 'site' in ts) {
      const site = ctx.state.sites[ts.site]
      if (site) ctx.teleport(tu.unit, site.x, site.y, 'surface')
    }
  },
})
