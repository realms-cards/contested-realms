import { registerScript } from '../registry'

// 'Summon four Frog tokens to an allied site.'
registerScript('Four Fat Frogs', {
  targets: [{ what: 'site', count: 1, targeted: false, label: 'an allied site', filter: (state, site, caster) => site.controller === caster.controller }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    for (let i = 0; i < 4; i++) ctx.summonToken('Frog', ctx.controller, site.x, site.y)
  },
})
