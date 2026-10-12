import { registerScript } from '../registry'
import { getCard, getKeywords } from '../../db'
import { pushLog, siteStillFlooded } from '../../../engine/effects'
import { isWaterSite, nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'

// 'Tap → Flood a site near your body of water until you do so again. Tap minions
//  without submerge there. They don't untap the next time they would.'
registerScript('Waveshaper', {
  abilities: [{
    key: 'wave',
    label: 'Flood a site near your waters',
    cost: { tap: true },
    effect: (ctx) => {
      const water = Object.values(ctx.state.sites).filter(
        (s) => s.controller === ctx.controller && isWaterSite(ctx.state, s, getCard),
      )
      if (!water.length) return ctx.log('You control no body of water.')
      const squares: { x: number; y: number }[] = []
      for (const w of water) {
        for (const adj of nearbySquaresW(ctx.state, w.x, w.y)) {
          const s = siteAt(ctx.state, adj.x, adj.y)
          // FAQ3: same site may be re-selected (keep it flooded continuously).
          // Allow already-flooded sites that this Waveshaper is currently keeping flooded.
          const keptByThis = ctx.state.flow?.waveshaperFlood?.[ctx.controller] === (s?.id)
          if (s && (!s.flooded || keptByThis) && !squares.some((q) => q.x === adj.x && q.y === adj.y)) squares.push(adj)
        }
      }
      if (!squares.length) return ctx.log('No dry site near your waters.')
      ctx.ask({ kind: 'chooseSquare', title: 'The wave crashes over which site?', data: { squares } }, 'wave')
    },
  }],
  conts: {
    wave: (ctx, _c, sq) => {
      const site = sq ? siteAt(ctx.state, sq.x, sq.y) : null
      if (!site) return
      const prev = ctx.state.flow?.waveshaperFlood?.[ctx.controller]
      ctx.state.flow = ctx.state.flow ?? {}
      // move this Waveshaper's standing wave to the new site FIRST, then re-derive the old site's flood so
      // it stays wet if some OTHER source (a Naiads, another Waveshaper, a Floodplain flood) still floods it
      ctx.state.flow.waveshaperFlood = { ...(ctx.state.flow.waveshaperFlood ?? {}), [ctx.controller]: site.id }
      if (prev && ctx.state.sites[prev]) ctx.state.sites[prev].flooded = siteStillFlooded(ctx.state, prev)
      ctx.floodSite(site.id)
      for (const u of unitsAt(ctx.state, site.x, site.y, 'surface')) {
        const kw = getKeywords(u.name)
        if (!u.isAvatar && !kw.submerge && !u.tapped) {
          u.tapped = true
          u.counters = { ...u.counters, skipUntap: 1 }
          pushLog(ctx.state, ctx.controller, `${u.name} is dragged under the churn.`)
        }
      }
    },
  },
})
