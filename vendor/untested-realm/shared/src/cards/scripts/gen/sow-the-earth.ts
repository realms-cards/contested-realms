import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Conjure Sow the Earth to a single void square, playing your top site there. /
//  This site provides double mana and threshold.'
registerScript('Sow the Earth', {
  auraPlacement: (state, _player, at) => (siteAt(state, at.x, at.y) ? 'Sow the Earth needs a void square.' : null),
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    const at = ctx.at
    if (!aura || !at) return
    aura.squares = [{ x: at.x, y: at.y }]
    const p = ctx.state.players[ctx.controller]
    const cardId = p.atlas.shift()
    if (cardId === undefined) return
    const siteId = `s${ctx.state.nextId++}`
    ctx.state.sites[siteId] = {
      id: siteId, cardId, name: ctx.state.cards[cardId].name, owner: ctx.controller,
      controller: ctx.controller, x: at.x, y: at.y, tapped: false, isRubble: false,
    }
    p.mana += 1
    aura.counters = { sownSite: Number(siteId.slice(1)) }
    pushLog(ctx.state, ctx.controller, `${ctx.state.cards[cardId].name} springs up, sown twice over.`)
  },
  // the sown site yields double: +1 mana and its printed threshold again
  auraSiteExtraMana: 1,
  auraSiteExtraThreshold: (state, aura, site) => {
    if (aura.counters?.sownSite === undefined || `s${aura.counters.sownSite}` !== site.id) return {}
    return getCard(site.name).thresholds
  },
})
