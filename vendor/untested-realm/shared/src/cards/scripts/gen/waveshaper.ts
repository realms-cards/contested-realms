import { registerScript } from '../registry'
import { getCard, getKeywords } from '../../db'
import { pushLog, siteStillFlooded } from '../../../engine/effects'
import { nearbySquaresW, siteAt, unitsAt, avatarOf } from '../../../engine/grid'
import { bodyOfWaterCells } from '../multi-card-utils/body-of-water'

// 'Tap → Flood a site near your body of water until you do so again. Tap minions
//  without submerge there. They don't untap the next time they would.'
registerScript('Waveshaper', {
  abilities: [{
    key: 'wave',
    label: 'Flood a site near your waters',
    cost: { tap: true },
    effect: (ctx) => {
      // "Your body of water" (FAQ) = the body of water your AVATAR currently occupies — a connected
      // region of water sites, which is CONTROLLER-INDEPENDENT (an opponent's water site in the same
      // body counts). If the avatar isn't in any body of water, the ability doesn't function.
      const av = avatarOf(ctx.state, ctx.controller)
      const body = av ? bodyOfWaterCells(ctx.state, av.x, av.y) : []
      if (!body.length) return ctx.log('The Waveshaper is a fish out of water — not in any body of water.')
      const squares: { x: number; y: number }[] = []
      for (const cell of body) {
        for (const adj of nearbySquaresW(ctx.state, cell.x, cell.y)) {
          const s = siteAt(ctx.state, adj.x, adj.y)
          // FAQ: any nearby SITE may be chosen — dry OR already wet (even flooded by another source),
          // and the same site over and over. Re-targeting re-applies the wave: it taps the non-submerge
          // minions there (the point of the ability; they tap even if the flood itself fails on Bedrock)
          // and moves your standing wave onto it.
          if (s && !squares.some((q) => q.x === adj.x && q.y === adj.y)) squares.push(adj)
        }
      }
      if (!squares.length) return ctx.log('No site near your waters.')
      ctx.ask({ kind: 'chooseSquare', title: 'The wave crashes over which site?', data: { squares } }, 'wave')
    },
  }],
  conts: {
    wave: (ctx, _c, sq) => {
      const site = sq ? siteAt(ctx.state, sq.x, sq.y) : null
      if (!site) return
      const prev = ctx.state.flow?.waveshaperFlood?.[ctx.controller]
      ctx.state.flow = ctx.state.flow ?? {}
      // a site already flooded by a PERMANENT effect (Atlantean Fate sets `flooded` once; siteStillFlooded
      // can't re-derive it) must stay flooded when the wave later moves on — remember it
      const ownFloods: string[] = ctx.state.flow.floodedBeforeWave ?? []
      if (site.flooded && !siteStillFlooded(ctx.state, site.id) && !ownFloods.includes(site.id)) ownFloods.push(site.id)
      ctx.state.flow.floodedBeforeWave = ownFloods
      // move this Waveshaper's standing wave to the new site FIRST, then re-derive the old site's flood so
      // it stays wet if some OTHER source (a Naiads, another Waveshaper, a Floodplain flood) still floods it
      ctx.state.flow.waveshaperFlood = { ...(ctx.state.flow.waveshaperFlood ?? {}), [ctx.controller]: site.id }
      if (prev && ctx.state.sites[prev]) {
        const keep = prev !== site.id && ownFloods.includes(prev)
        ctx.state.sites[prev].flooded = keep || siteStillFlooded(ctx.state, prev)
        if (keep) ctx.state.flow.floodedBeforeWave = ownFloods.filter((id) => id !== prev)
      }
      ctx.floodSite(site.id)
      for (const u of unitsAt(ctx.state, site.x, site.y, 'surface')) {
        const kw = getKeywords(u.name)
        if (u.isAvatar || kw.submerge) continue
        // "Tap minions without submerge there. They don't untap the next time they would."
        // The untap-skip applies to every non-submerge minion here — including one already tapped
        // (it still must miss its next untap), so the skip marker is set regardless of tap state.
        if (!u.tapped) {
          u.tapped = true
          pushLog(ctx.state, ctx.controller, `${u.name} is dragged under the churn.`)
        }
        u.counters = { ...u.counters, skipUntap: 1 }
      }
    },
  },
})
