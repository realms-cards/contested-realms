import { type CardScript, type AbilityDef } from '../registry'
import { pushLog } from '../../../engine/effects'
import { isUnmodifiable } from '../../../engine/statics'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

// Reveal-from-hand transforms: an eligible allied minion becomes this card, in place (Slimy Mutants ← a
// submerging ally; Sir Gareth ← a Mortal ally). The chosen minion keeps its square/damage-cleared body but
// adopts this card's name + cardId. "Can't be modified" minions (Monks of Kobalsa / Bedrock) are immune.
export function transformFromHand(opts: {
  name: string
  keyPrefix: string
  label: string
  cost: AbilityDef['cost']
  threshold?: AbilityDef['threshold']
  eligible: (state: GameState, u: UnitState) => boolean
  emptyMsg: string
  askTitle: string
  log: string
}): CardScript {
  const { name, keyPrefix, label, cost, threshold, eligible, emptyMsg, askTitle, log } = opts
  const allies = (state: GameState, owner: PlayerId): string[] =>
    Object.values(state.units)
      .filter((u) => u.controller === owner && !u.isAvatar && eligible(state, u))
      .map((u) => u.id)
  return {
    // no eligible ally → not offered (it would spend the cost and only log `emptyMsg`)
    handAbilities: (state, cardId, owner) => (allies(state, owner).length ? [{
      key: `${keyPrefix}:${cardId}`,
      label,
      cost,
      ...(threshold ? { threshold } : {}),
      effect: (ctx) => {
        const candidates = allies(ctx.state, ctx.controller)
        if (!candidates.length) return ctx.log(emptyMsg)
        ctx.ask({ kind: 'chooseTargets', title: askTitle, data: { candidates, count: 1, upTo: false, kind: 'unit' } }, 'transform', { cardId })
      },
    }] : []),
    conts: {
      transform: (ctx, c, choice) => {
        const id = Array.isArray(choice) ? choice[0] : choice
        const u = typeof id === 'string' ? ctx.state.units[id] : null
        const p = ctx.state.players[ctx.controller]
        const cardId = c.cardId as string
        if (!u || !p.hand.includes(cardId)) return
        if (isUnmodifiable(ctx.state, u)) return ctx.log("That minion can't be modified.")
        p.hand.splice(p.hand.indexOf(cardId), 1)
        u.name = name
        u.cardId = cardId
        u.damage = 0
        pushLog(ctx.state, ctx.controller, log)
      },
    },
  }
}
