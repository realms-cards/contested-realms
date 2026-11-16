import { registerScript } from '../registry'
import { getCard } from '../../db'
import { printingsFor, isAlphaPrinting } from '../../printings'
import { avatarOf } from '../../../engine/grid'
import { castFromCollection, affordable } from '../../../engine/casting'
import { cardSubtypesFor, collectionBanned } from '../../../engine/statics'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'
import type { GameState, PlayerId } from '../../../engine/types'

// 'Genesis → Cast an @ Beast from your collection here, disabled until your next turn.'
// The "@" is the Alpha set symbol (FAQ: "The card must have the alpha set symbol printed on it") — about the
// PRINTING of the copy the player owns (Roberto): a collection Beast whose copy is Alpha, i.e. the deck chose
// its Alpha art (001-… slug), and the deck isn't an official precon (setup.ts: collectionAlpha). ALPHA_BEAST.
// It is cast for real, paying its cost (castFromCollection, as every
// "cast X from your collection" site), and isn't optional ("Cast", not "you may"): with a castable Alpha
// Beast you pick one; with none, nothing happens. The Beast enters already disabled until your next turn —
// the disable goes on as it enters (onUnitEnters runs before its Genesis), so its Genesis doesn't fire.
// FAQ golden rule: a Polar Bears cast this way is the ALPHA version — 2 cost, 2 power (today's printing is
// 3/3): this site's costModifier takes (1) off that one cast, and the Bears that enters carries a permanent
// −1 power modifier noted "Alpha printing", so everyone sees it is the 2-power Bears.
const ALPHA_BEAST = (state: GameState, player: PlayerId, name: string): boolean =>
  !!state.players[player].collectionAlpha?.includes(name) && getCard(name).type === 'Minion' && cardSubtypesFor(state, player, name).includes('Beast')
const ALPHA_VERSION: Record<string, { cost: number; power: number }> = { 'Polar Bears': { cost: 2, power: 2 } }

// `cardId`: the cast's card, once castFromCollection has created it — set only if the cast parked behind a
// prompt. Until then (inside that very call) the pending record IS the cast in flight.
type Pending = { siteId: string; player: PlayerId; name: string; x: number; y: number; turn: number; cardId?: string }

/** the Thaw's cast still under way? A record from an earlier turn, or whose parked cast card has left the
 *  hand (cast or fizzled), is stale — a later Polar Bears cast here mustn't inherit the Alpha rule. */
function livePending(state: GameState, siteId: string, entering = false): Pending | undefined {
  const pending = state.flow?.ancientThaw as Pending | undefined
  if (!pending || pending.siteId !== siteId || pending.turn !== state.turn) return undefined
  // (the entering Beast's card has just left the hand; it is matched by card id instead)
  if (!entering && pending.cardId && !state.players[pending.player].hand.includes(pending.cardId)) return undefined
  return pending
}

function castableBeasts(state: GameState, siteId: string, player: PlayerId): string[] {
  const p = state.players[player]
  const caster = avatarOf(state, player)
  const site = state.sites[siteId]
  if (!caster || !site) return []
  return Object.keys(p.collection).filter((name) => {
    if ((p.collection[name] ?? 0) <= 0 || collectionBanned(state, player, name) || !ALPHA_BEAST(state, player, name)) return false
    return withPending(state, { siteId, player, name, x: site.x, y: site.y, turn: state.turn }, () => affordable(state, player, name, caster))
  }).sort()
}

/** run `fn` with this cast pending, so the Alpha discount counts toward affordability */
function withPending<T>(state: GameState, pending: Pending, fn: () => T): T {
  state.flow = state.flow ?? {}
  const prev = state.flow.ancientThaw
  state.flow.ancientThaw = pending
  try { return fn() } finally {
    if (prev === undefined) delete state.flow.ancientThaw
    else state.flow.ancientThaw = prev
  }
}

registerScript('Ancient Thaw', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const beasts = castableBeasts(ctx.state, self.id, ctx.controller)
    if (!beasts.length) return ctx.log('Ancient Thaw: no Alpha Beast in your collection can be cast.')
    if (beasts.length === 1) return thaw(ctx.state, self.id, ctx.controller, beasts[0])
    ctx.ask({ kind: 'chooseOption', title: 'Ancient Thaw: cast which Alpha Beast from your collection here?', data: { options: beasts } }, 'beast')
  },
  endOfEveryTurn: (ctx) => {
    if ((ctx.state.flow?.ancientThaw as Pending | undefined)?.siteId === ctx.sourceId) delete ctx.state.flow!.ancientThaw
  },
  conts: {
    beast: (ctx, _c, name) => {
      if (typeof name !== 'string' || !castableBeasts(ctx.state, ctx.sourceId, ctx.controller).includes(name)) return
      thaw(ctx.state, ctx.sourceId, ctx.controller, name)
    },
  },
  costModifier: (state, sourceId, caster, cardName) => {
    const pending = livePending(state, sourceId)
    const alpha = ALPHA_VERSION[cardName]
    if (!alpha || !pending || pending.name !== cardName || pending.player !== caster.controller) return 0
    return alpha.cost - (getCard(cardName).cost ?? 0)
  },
  onUnitEnters: (ctx, entered) => {
    const pending = livePending(ctx.state, ctx.sourceId, true)
    if (!pending) return
    if (pending.cardId && entered.cardId !== pending.cardId) return
    if (entered.controller !== pending.player || entered.name !== pending.name || entered.x !== pending.x || entered.y !== pending.y) return
    delete ctx.state.flow!.ancientThaw
    // the cast copy is the owner's Alpha printing — show it (its art travels to the opponent: it's in the realm)
    const card = ctx.state.cards[entered.cardId]
    const slug = printingsFor(entered.name).find((pr) => isAlphaPrinting(pr.slug))?.slug
    if (card) { card.alpha = true; if (slug) card.art = slug }
    const alpha = ALPHA_VERSION[entered.name]
    const unit = ctx.state.units[entered.id]
    if (alpha && unit) {
      const delta = alpha.power - (getCard(entered.name).attack ?? 0)
      unit.modifiers.push({ kind: 'power', amount: delta, duration: 'permanent', turn: ctx.state.turn, sourcePlayer: pending.player, note: 'Alpha printing' })
      ctx.log(`${entered.name} enters as its Alpha printing: ${alpha.power} power.`)
    }
    disableUntilYourNextTurn(ctx, entered.id, pending.player)
    ctx.log(`${entered.name} thaws out of the ice, still numb until your next turn.`)
  },
})

function thaw(state: GameState, siteId: string, player: PlayerId, name: string): void {
  const site = state.sites[siteId]
  if (!site) return
  state.flow = state.flow ?? {}
  const pending: Pending = { siteId, player, name, x: site.x, y: site.y, turn: state.turn }
  state.flow.ancientThaw = pending
  const before = new Set(Object.keys(state.cards))
  const started = castFromCollection(state, player, name, { x: site.x, y: site.y, region: 'surface' })
  if (state.flow?.ancientThaw !== pending) return // the Beast has entered (onUnitEnters cleared it)
  // parked behind a prompt: pin the record to this cast's card, so only it gets the Alpha rule; otherwise
  // (refused, or fizzled) it's gone
  const cardId = Object.keys(state.cards).find((id) => !before.has(id) && state.cards[id].name === name)
  if (started && cardId) pending.cardId = cardId
  else delete state.flow.ancientThaw
}
