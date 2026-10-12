import { registerScript } from '../registry'
import { pushLog, wardUnit } from '../../../engine/effects'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'

// 'At the end of your turn, you may transfer a nearby Ward onto a nearby minion or site.'
registerScript('Seraphim', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // the Ward to lift may sit on a nearby unit OR a nearby site — both are candidates
    const sources: string[] = []
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      // nearby minion is region-locked to the source
      for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) if (u.ward) sources.push(u.id)
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site?.ward) sources.push(site.id)
    }
    if (!sources.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Seraphim: lift whose Ward? (skip for none)', data: { candidates: sources, count: 1, upTo: true, kind: 'unitOrSite' } }, 'lift')
  },
  conts: {
    lift: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof id !== 'string') return
      const holderU = ctx.state.units[id]; const holderS = ctx.state.sites[id]
      if (!holderU?.ward && !holderS?.ward) return
      // "onto a nearby minion or site" — recipients are nearby non-avatar units AND sites
      // that aren't already Warded (and not the source itself)
      const recipients: string[] = []
      for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
        for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) if (u.id !== id && !u.ward && !u.isAvatar) recipients.push(u.id)
        const site = siteAt(ctx.state, sq.x, sq.y)
        if (site && site.id !== id && !site.ward) recipients.push(site.id)
      }
      if (!recipients.length) return
      ctx.ask({ kind: 'chooseTargets', title: 'Bestow the Ward on whom?', data: { candidates: recipients, count: 1, upTo: false, kind: 'unitOrSite' } }, 'bestow', { from: id })
    },
    bestow: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const fromU = ctx.state.units[c.from as string]; const fromS = ctx.state.sites[c.from as string]
      if (!fromU?.ward && !fromS?.ward) return
      const toU = typeof id === 'string' ? ctx.state.units[id] : null
      const toS = typeof id === 'string' ? ctx.state.sites[id] : null
      if (toU && !toU.ward) {
        // wardUnit enforces the Evil clause — only lift the source if the ward actually lands
        if (wardUnit(ctx.state, toU)) {
          if (fromU) fromU.ward = false; else if (fromS) fromS.ward = false
          pushLog(ctx.state, ctx.controller, `The Seraphim carries the Ward to ${toU.name}.`)
        }
      } else if (toS && !toS.ward) {
        toS.ward = true // sites have no Evil clause
        if (fromU) fromU.ward = false; else if (fromS) fromS.ward = false
        pushLog(ctx.state, ctx.controller, `The Seraphim carries the Ward to ${toS.name}.`)
      }
    },
  },
})
