import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Target adjacent site is silenced and provides no threshold while
//  Sinterfee is in the realm.'
registerScript('Sinterfee', {
  genesisTargets: [{ what: 'site', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent site' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    const self = ctx.state.units[ctx.sourceId]
    if (!t || !('site' in t) || !self) return
    self.counters = { ...self.counters, sinterfeeSite: Number(t.site.slice(1)) }
    pushLog(ctx.state, ctx.controller, `${ctx.state.sites[t.site]?.name} falls dark under Sinterfee's pall.`)
  },
  unitSilencesSiteAt: (state, selfId, site) => {
    const self = state.units[selfId]
    return !!self && self.counters?.sinterfeeSite !== undefined && site.id === `s${self.counters.sinterfeeSite}`
  },
  unitSuppressesSiteThreshold: (state, selfId, site) => {
    const self = state.units[selfId]
    return !!self && self.counters?.sinterfeeSite !== undefined && site.id === `s${self.counters.sinterfeeSite}`
  },
})
