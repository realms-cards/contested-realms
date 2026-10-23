import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, pushPrompt, toCemetery } from '../../../engine/effects'
import { payZoneToll } from '../../../engine/statics'

// ---------- site damage ----------

// 'Whenever an affected site takes damage, banish a minion from your cemetery
//  to prevent it. If you can't, dispel this.'
registerScript('Mortal Soil', {
  // fires ONLY when one of the soil's affected sites takes damage; may prompt for
  // WHICH cemetery minion to banish (the old synchronous modifier auto-picked the first).
  affectedSiteDamage: (state, selfId, site, n) => {
    const aura = state.auras[selfId]
    if (!aura || n <= 0) return false
    if (!aura.squares.some((s) => s.x === site.x && s.y === site.y)) return false // not an affected site
    const p = state.players[aura.controller]
    const minions = p.cemetery.filter((id) => getCard(state.cards[id].name).type === 'Minion')
    // banishing from the cemetery is access → the Bureau of Occult Control tolls it; failing to pay
    // means you can't banish, so the soil gives out just as with an empty cemetery
    const tollUnpaid = minions.length > 0 && !payZoneToll(state, aura.controller)
    if (tollUnpaid) pushLog(state, aura.controller, 'The Bureau of Occult Control demands (2) for cemetery access.')
    if (minions.length === 0 || tollUnpaid) {
      // "If you can't, dispel this." — the soil gives out; the damage proceeds
      const card = state.cards[aura.cardId]
      if (card) toCemetery(state, card.id)
      delete state.auras[selfId]
      pushLog(state, aura.controller, 'The Mortal Soil crumbles to dust.')
      return false
    }
    if (minions.length === 1) {
      const ci = p.cemetery.indexOf(minions[0])
      if (ci >= 0) { p.cemetery.splice(ci, 1); p.banished.push(minions[0]) }
      pushLog(state, aura.controller, `${state.cards[minions[0]].name} is fed to the Mortal Soil — the site is spared.`)
      return true
    }
    // 2+ minions → the controller chooses WHICH to banish; defer (damage prevented)
    pushPrompt(state, {
      player: aura.controller,
      kind: 'chooseCards',
      title: 'Mortal Soil — banish which minion from your cemetery to spare the site?',
      data: { cards: minions.map((id) => state.cards[id].name), pick: 1, upTo: false },
      cont: 'mortalSoil:banish',
      ctx: { auraId: selfId, minionIds: minions },
    })
    return true
  },
})
