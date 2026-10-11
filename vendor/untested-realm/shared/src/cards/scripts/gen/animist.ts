import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { validateSummonAt } from '../../../engine/casting'
import type { GameState, PlayerId } from '../../../engine/types'

/** Every site a Spirit may legally be summoned to: your own sites PLUS anywhere a
 *  Spirit-summon permission opens up (Evil Presence's affected sites, Summoning
 *  Sphere, etc.). Reuse the engine's summon-legality with the printed 'Spirit'
 *  token as the proxy card so all those rules apply automatically. */
function animistSpiritSquares(state: GameState, player: PlayerId): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (const s of Object.values(state.sites)) {
    if (s.isRubble) continue
    if (validateSummonAt(state, player, 'Spirit', { x: s.x, y: s.y, region: 'surface' }) === null) out.push({ x: s.x, y: s.y })
  }
  return out
}

function animistOfferPlace(ctx: EffectAPI, cardId: string): void {
  const p = ctx.state.players[ctx.controller]
  const name = ctx.state.cards[cardId].name
  const cost = getCard(name).cost ?? 0
  if (p.mana < cost) return ctx.log(`Not enough mana (${p.mana}/${cost}).`)
  const squares = animistSpiritSquares(ctx.state, ctx.controller)
  if (!squares.length) return ctx.log('Nowhere to summon a Spirit.')
  ctx.ask({ kind: 'chooseSquare', title: `Summon the ${name} Spirit where?`, data: { squares } }, 'place', { cardId, cost })
}

registerScript('Animist', {
  subtypeOverride: (_state, _selfId, unit, st) =>
    unit.counters?.animistSpirit && !st.includes('Spirit') ? [...st, 'Spirit'] : st,
  abilities: [{
    key: 'animate',
    label: 'Cast a magic as a Spirit',
    cost: {},
    tentativePlay: true, // online: held tentatively, only recorded/broadcast if a Spirit is actually cast
    // only offered when there's actually a magic to cast — so activating it is never a recorded no-op
    // (the engine rejects it otherwise, the GUI hides the button, and the bot won't enumerate it)
    available: (state, id) => {
      const u = state.units[id]
      return !!u && state.players[u.controller].hand.some((cid) => getCard(state.cards[cid].name).type === 'Magic')
    },
    effect: (ctx) => {
      const p = ctx.state.players[ctx.controller]
      // the client "Cast as Spirit" shortcut pre-selects the magic being cast
      const pre = (ctx.extra as { cardId?: string } | undefined)?.cardId
      if (pre && p.hand.includes(pre) && getCard(ctx.state.cards[pre].name).type === 'Magic') {
        return animistOfferPlace(ctx, pre)
      }
      const magics = p.hand.filter((id) => getCard(ctx.state.cards[id].name).type === 'Magic')
      if (!magics.length) return ctx.log('No magics in hand.')
      ctx.ask(
        { kind: 'chooseCards', title: 'Which magic takes Spirit form?', data: { cards: magics.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
        'pick',
        { magics },
      )
    },
  }],
  conts: {
    pick: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const cardId = (c.magics as string[])[idx]
      if (cardId) animistOfferPlace(ctx, cardId)
    },
    place: (ctx, c, sq) => {
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      const cost = c.cost as number
      const site = sq ? siteAt(ctx.state, sq.x, sq.y) : null
      if (!site || !p.hand.includes(cardId) || p.mana < cost) return
      // re-validate the chosen square is a legal Spirit summon (own site / Evil Presence area / …)
      if (validateSummonAt(ctx.state, ctx.controller, 'Spirit', { x: site.x, y: site.y, region: 'surface' }) !== null) return
      ctx.spendMana(ctx.controller, cost)
      p.hand.splice(p.hand.indexOf(cardId), 1)
      const name = ctx.state.cards[cardId].name
      const unitId = `u${ctx.state.nextId++}`
      // route through effectSummonUnit so enter-triggers fire — e.g. an Evil
      // Presence covering this site gives the Spirit Charge and returns to hand
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
        isAvatar: false, x: site.x, y: site.y, region: 'surface', tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [{ kind: 'power', amount: cost, duration: 'permanent', turn: ctx.state.turn, sourcePlayer: ctx.controller }],
        carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { animistSpirit: 1 },
      })
      pushLog(ctx.state, ctx.controller, `${name} takes Spirit form (${cost} power).`)
    },
  },
})
