import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { isEvilCardNameFor } from '../../../engine/statics'
import { effectCastSpell, affordable, validateSummonAt } from '../../../engine/casting'
import { avatarOf } from '../../../engine/grid'

// 'Players play with the top card of their spellbook revealed. / Players may
//  cast Evil from the top of their spellbook here.'
registerScript('Doomsday Cult', {
  startOfEachTurn: (ctx, activePlayer) => {
    const p = ctx.state.players[activePlayer]
    const top = p.spellbook[0]
    if (top !== undefined) {
      pushLog(ctx.state, null, `📖 ${p.name}'s next spell: ${ctx.state.cards[top].name}.`)
      // everyone has now seen it (The Inquisition cares)
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.revealedCards = [...new Set([...(ctx.state.flow.revealedCards ?? []), top])]
    }
  },
  grantsAbilities: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || !unit.isAvatar) return []
    const p = state.players[unit.controller]
    // `?.` guards a view-shaped state (the client's redacted view has no spellbook array, only counts +
    // the revealed top) — grant nothing there rather than throwing, which would blank the avatar's whole
    // granted-ability list. The client decides castability from the revealed top instead.
    const top = p.spellbook?.[0]
    if (top === undefined) return []
    const name = state.cards[top].name
    if (getCard(name).type !== 'Minion' || !isEvilCardNameFor(state, unit.controller, name)) return []
    return [{
      key: 'cult:sermon',
      label: `Cult: cast ${name} here`,
      cost: {},
      effect: (ctx2) => {
        const cult = ctx2.state.units[selfId] // THIS Cult (grants the ability), not whichever copy is first
        const p2 = ctx2.state.players[ctx2.controller]
        const top2 = p2.spellbook[0]
        if (!cult || top2 === undefined) return
        const n2 = ctx2.state.cards[top2].name
        if (getCard(n2).type !== 'Minion' || !isEvilCardNameFor(ctx2.state, ctx2.controller, n2)) return
        const at = { x: cult.x, y: cult.y }
        // "may cast" — only when the player can actually pay AND the minion can be summoned onto the Cult's
        // site. Never consume a card we can't cast: it stays on top otherwise.
        if (!affordable(ctx2.state, ctx2.controller, n2, avatarOf(ctx2.state, ctx2.controller))) return
        if (validateSummonAt(ctx2.state, ctx2.controller, n2, at) !== null) return
        // CAST it for real from the top of the spellbook — pay its cost, prompt any Genesis targets, land it
        // on the Cult's site as a REAL minion (dies to the cemetery). No hand step, no pick-up. effectCastSpell
        // mints its own real (non-token) card by name, so the original top card is consumed outright.
        p2.spellbook.shift()
        delete ctx2.state.cards[top2]
        effectCastSpell(ctx2.state, ctx2.controller, n2, { free: false, at })
        pushLog(ctx2.state, ctx2.controller, `${n2} answers the Cult's sermon.`)
      },
    }]
  },
})
