import { type CardScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { isEvilU } from './is-evil-u'

// 'An ally Wards its site, then may transform it into a Consecrated Ground from
//  your collection.' / mirror for Desecrate.
export function groundRitualScript(ground: string, needsEvil: boolean, strikesFirstText: boolean): CardScript {
  return {
    targets: [{
      what: 'minion', count: 1, targeted: false, owner: 'ally', label: needsEvil ? 'an Evil ally' : 'an ally',
      filter: (state, u) => (needsEvil ? isEvilU(state, u) : true),
    }],
    onCast: (ctx) => {
      const t = ctx.targets[0]
      if (!t || !('unit' in t)) return
      const ally = ctx.state.units[t.unit]
      const site = ally ? siteAt(ctx.state, ally.x, ally.y) : null
      if (!ally || !site) return ctx.log('No site beneath them.')
      if (strikesFirstText) {
        ctx.strike(ally, { site: site.id })
      } else {
        ;(site as any).ward = true // site ward — no Evil clause, kept direct
        pushLog(ctx.state, ctx.controller, `${site.name} is warded.`)
      }
      if (!ctx.state.sites[site.id]) return
      ctx.ask({ kind: 'yesNo', title: `Transform ${site.name} into ${ground}?` }, 'transform', { siteId: site.id })
    },
    conts: {
      transform: (ctx, c, yes) => {
        const site = ctx.state.sites[c.siteId as string]
        if (!yes || !site) return
        const cardId = `c${ctx.state.nextId++}`
        ctx.state.cards[cardId] = { id: cardId, name: ground, owner: ctx.controller }
        site.name = ground
        site.cardId = cardId
        pushLog(ctx.state, ctx.controller, `The land is remade: ${ground}.`)
      },
    },
  }
}
