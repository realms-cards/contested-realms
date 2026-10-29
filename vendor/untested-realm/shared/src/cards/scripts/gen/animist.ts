import { registerScript, type EffectAPI } from '../registry'
import { getCard, spiritCastName } from '../../db'
import { validateSummonAt, effectiveCost, castSpell, canCast } from '../../../engine/casting'
import type { GameState, PlayerId } from '../../../engine/types'

/** Every site the magic may take Spirit form at, and afford there: the summon rules of its Spirit card
 *  (your own sites, Evil Presence's area, Summoning Sphere…) and the cost of casting it there (cost
 *  modifiers can depend on the location). castSpell re-validates all of it. */
function spiritSquares(state: GameState, player: PlayerId, casterId: string, cardId: string): { x: number; y: number }[] {
  const caster = state.units[casterId]
  const name = spiritCastName(state.cards[cardId].name)
  const out: { x: number; y: number }[] = []
  for (const s of Object.values(state.sites)) {
    if (s.isRubble) continue
    const at = { x: s.x, y: s.y, region: 'surface' as const }
    if (validateSummonAt(state, player, name, at) !== null) continue
    if (caster && effectiveCost(state, player, name, caster, at, cardId) > state.players[player].mana) continue
    out.push({ x: s.x, y: s.y })
  }
  return out
}

function animistOfferPlace(ctx: EffectAPI, cardId: string): void {
  const name = ctx.state.cards[cardId].name
  // a real cast: the magic's threshold, a caster able to cast it, … (castSpell's own checks)
  const check = canCast(ctx.state, ctx.controller, cardId, ctx.sourceId)
  if (!check.ok) return ctx.log(check.reason ?? `${name} can't be cast.`)
  const squares = spiritSquares(ctx.state, ctx.controller, ctx.sourceId, cardId)
  if (!squares.length) return ctx.log(`Nowhere you can afford to cast ${name} as a Spirit.`)
  ctx.ask({ kind: 'chooseSquare', title: `Summon the ${name} Spirit where?`, data: { squares } }, 'place', { cardId })
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
      if (!sq) return
      // a true cast: costs and their modifiers, "when you cast" triggers, summon rules — the magic is a
      // Minion spell while it's cast, and enters as a Spirit with power equal to its printed cost
      const err = castSpell(ctx.state, ctx.controller, c.cardId as string, ctx.sourceId, { x: sq.x, y: sq.y, region: 'surface' }, [], { asSpirit: true })
      if (err) ctx.log(err)
    },
  },
})
