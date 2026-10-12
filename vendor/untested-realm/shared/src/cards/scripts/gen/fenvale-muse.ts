import { registerScript, getScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, makeCtx } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'

// 'Spellcaster / Whenever Fenvale Muse casts a spell, you may trigger the
//  Genesis of a nearby River.'
registerScript('Fenvale Muse', {
  onSpellCast: (ctx, by, _cardName, casterId) => {
    if (by !== ctx.controller || casterId !== ctx.sourceId) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const rivers = nearbySquaresW(ctx.state, self.x, self.y)
      .map((s) => siteAt(ctx.state, s.x, s.y))
      .filter((s): s is NonNullable<typeof s> =>
        !!s && !s.isRubble && (/river/i.test(s.name) || getCard(s.name).subtypes.includes('River')))
    if (!rivers.length) return
    ctx.ask(
      { kind: 'chooseSquare', title: 'Fenvale Muse: reawaken which River? (skip for none)', data: { squares: rivers.map((s) => ({ x: s.x, y: s.y })) } },
      'inspire',
    )
  },
  conts: {
    inspire: (ctx, _c, sq) => {
      const site = sq ? siteAt(ctx.state, sq.x, sq.y) : null
      if (!site) return
      const g = getScript(site.name)?.genesis
      if (g && site.controller !== null) {
        g(makeCtx(ctx.state, site.id, site.controller as PlayerId, []))
        pushLog(ctx.state, ctx.controller, `${site.name} surges anew at the Muse's song.`)
      }
    },
  },
})
