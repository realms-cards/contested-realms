import { registerScript } from '../registry'
import { findCard } from '../../db'
import { isBearName } from '../multi-card-utils/is-bear'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { effSubtypes, isUnmodifiable } from '../../../engine/statics'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

// '(W)(W) — You may pay the difference in cost to transform a Mortal or Bear into Bearserker from hand,
//  untapped.'
// A hand ability (surfaced on the Avatar) usable while you have (W)(W). "Bear" isn't a subtype: like
// Royalty (codex), it's read off the card name — a name word starting "Bear" (Brown Bears,
// Polar Bears; not Overbearing Bailiff) — the shared isBearName, as Nanurluk reads its "Bears".
// The text says "a Mortal or Bear", not "an allied" one, so any minion in the realm qualifies; per the
// codex/FAQ a transform never changes control, so an enemy one stays theirs (your Bearserker card, which
// goes to your cemetery). The difference is Bearserker's cost minus the minion's printed cost, never
// below 0. Codex Transform: the same game object — damage, carried things and ongoing effects stay, no
// Genesis, no summoning sickness reset — and the old card is banished (a token simply ceases to exist).
// "untapped": the new form enters play-state untapped. Not a "target", so a Ward neither blocks nor breaks.
const COST = 5

function eligible(state: GameState, u: UnitState): boolean {
  // a Bearserker can't become what it already is (it would untap for free by binning a copy)
  return !u.isAvatar && u.name !== 'Bearserker' && (effSubtypes(state, u).includes('Mortal') || isBearName(u.name)) && !isUnmodifiable(state, u)
}

function difference(u: UnitState): number {
  return Math.max(0, COST - (findCard(u.name)?.cost ?? 0))
}

function candidates(state: GameState, owner: PlayerId): string[] {
  const mana = state.players[owner].mana
  return Object.values(state.units).filter((u) => eligible(state, u) && difference(u) <= mana).map((u) => u.id)
}

registerScript('Bearserker', {
  handAbilities: (state, cardId, owner) => (candidates(state, owner).length ? [{
    key: `bearserker:${cardId}`,
    label: 'Pay the difference → a Mortal or Bear becomes Bearserker, untapped',
    cost: {},
    threshold: { water: 2 },
    effect: (ctx) => {
      const cands = candidates(ctx.state, ctx.controller)
      if (!cands.length) return ctx.log('No Mortal or Bear to transform.')
      ctx.ask(
        { kind: 'chooseTargets', title: 'Which Mortal or Bear becomes the Bearserker?', data: { candidates: cands, count: 1, upTo: true, kind: 'unit', notTargeted: true } },
        'rage',
        { cardId },
      )
    },
  }] : []),
  conts: {
    rage: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      if (!u || !p.hand.includes(cardId) || !eligible(ctx.state, u)) return
      const diff = difference(u)
      if (p.mana < diff) return pushLog(ctx.state, ctx.controller, `Not enough mana (${p.mana}/${diff}).`)
      ctx.spendMana(ctx.controller, diff)
      p.hand.splice(p.hand.indexOf(cardId), 1)
      const old = ctx.state.cards[u.cardId]
      if (old && !old.isToken) ctx.state.players[old.owner].banished.push(old.id)
      const was = u.name
      u.name = 'Bearserker'
      u.cardId = cardId
      u.owner = ctx.state.cards[cardId].owner
      u.tapped = false
      pushLog(ctx.state, ctx.controller, `${was} flies into a rage — it is a Bearserker now!`)
      checkStateBased(ctx.state) // its damage stays: a hurt minion may not survive the smaller body
    },
  },
})
