import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { Thresholds } from '../../../engine/types'

// 'Genesis → Choose one: (A), (E), (F), (W). This site provides that permanently.'
registerScript('Valley of Delight', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'The Valley delights in which element?', data: { options: ['Air', 'Earth', 'Fire', 'Water'] } }, 'delight')
  },
  siteExtraThreshold: (state, site) => {
    const s = state.sites[site.id]
    const el = s?.counters?.delight
    if (el === undefined) return {}
    return [{ air: 1 }, { earth: 1 }, { fire: 1 }, { water: 1 }][el] as Partial<Thresholds>
  },
  conts: {
    delight: (ctx, _c, choice) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self || typeof choice !== 'string') return
      self.counters = { ...self.counters, delight: ['Air', 'Earth', 'Fire', 'Water'].indexOf(choice) }
      pushLog(ctx.state, ctx.controller, `The Valley of Delight blooms with ${choice}.`)
    },
  },
})
