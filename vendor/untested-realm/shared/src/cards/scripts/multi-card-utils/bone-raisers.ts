import { type EffectAPI, type AbilityDef } from '../registry'
import { pushLog, killUnit, effectSummonUnit } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'
import { siteAt } from '../../../engine/grid'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

// '(N), Sacrifice a Skeleton token → Summon this minion from your cemetery to
//  that site.' — this is a CEMETERY ability of the bone-raiser itself: it lives on the
//  card (so it can be activated straight from the grave), and every Skeleton token also
//  grants a convenience copy (click the token to sacrifice IT). Both routes share one
//  summon path. Because the ability is a card ability, Vivien copies it wherever she is:
//  with a spellcaster bone-raiser in the realm, a dead Vivien offers the same raise, and
//  her self-reference ("summon THIS") resolves to HER card — sacrifice a Skeleton, raise
//  Vivien. The Skeleton grant likewise offers a cemetery Vivien who is copying a raiser.
export const BONE_RAISERS: Record<string, number> = { 'Barrow Wight': 2, 'Bone Jumble': 1, 'Fowl Bones': 1, 'Zombie Bruiser': 4 }

/** Skeleton tokens `player` controls that stand on a site square (a raise needs a site to land on). */
function sacrificeableSkeletons(state: GameState, player: PlayerId): UnitState[] {
  return Object.values(state.units).filter((u) => u.controller === player && u.name === 'Skeleton' && !!siteAt(state, u.x, u.y))
}

/** remove `cardId` from `player`'s cemetery and summon it to (x,y) surface; Genesis fires (FAQ 1242). */
export function raiseFromCemetery(state: GameState, player: PlayerId, cardId: string, x: number, y: number): void {
  const pl = state.players[player]
  const idx = pl.cemetery.indexOf(cardId)
  if (idx < 0 || !siteAt(state, x, y)) return
  pl.cemetery.splice(idx, 1)
  const name = state.cards[cardId].name
  // Zombie Vivien — a dead Vivien copying a bone-raiser's cemetery ability raises HERSELF
  if (name === 'Vivien the Enchantress') awardAchievement(state, 'zombie-vivien', player)
  effectSummonUnit(state, {
    id: `u${state.nextId++}`, cardId, name, owner: state.cards[cardId].owner, controller: player,
    isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0,
    enteredTurn: state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  })
  pushLog(state, player, `A sacrificed Skeleton's bones reshape into ${name}!`)
}

/** sacrifice `skId` (a Skeleton token) and raise `cardId` from the cemetery onto its square. */
export function sacrificeSkeletonAndRaise(state: GameState, player: PlayerId, cardId: string, skId: string): void {
  const sk = state.units[skId]
  if (!sk || sk.name !== 'Skeleton') return
  const { x, y } = sk
  state.flow = state.flow ?? {}
  const prev = state.flow.sacrificing
  state.flow.sacrificing = sk.id // a sacrifice bypasses "can't be destroyed"
  killUnit(state, sk.id)
  state.flow.sacrificing = prev
  raiseFromCemetery(state, player, cardId, x, y)
}

/** The bone-raiser's own from-cemetery ability: pay N, sacrifice a chosen Skeleton token, and
 *  summon THIS card (by its cardId, so a copying Vivien raises herself) onto that Skeleton's
 *  square. Conts live on 'Bone Jumble'; every raiser routes its ask there via contOwner. */
export function boneRaiseCemeteryAbility(cost: number): (state: GameState, cardId: string, owner: PlayerId) => AbilityDef[] {
  return (_state, cardId, owner) => [{
    key: `boneRaise:${cardId}`,
    label: `(${cost}), sacrifice a Skeleton → raise this from your cemetery`,
    cost: { mana: cost },
    contOwner: 'Bone Jumble',
    // hidden/rejected unless a Skeleton is available to sacrifice (mana is paid before the effect,
    // so we must not let it fire with nothing to sacrifice) and the card is still in the grave.
    available: (s) => s.players[owner].cemetery.includes(cardId) && sacrificeableSkeletons(s, owner).length > 0,
    dynamicLabel: (s) => `(${cost}), sacrifice a Skeleton → raise ${s.cards[cardId]?.name ?? 'this'} here`,
    effect: (ctx: EffectAPI) => {
      const skels = sacrificeableSkeletons(ctx.state, ctx.controller)
      if (!skels.length) return ctx.log('No Skeleton token on a site to sacrifice.')
      if (skels.length === 1) return sacrificeSkeletonAndRaise(ctx.state, ctx.controller, cardId, skels[0].id)
      ctx.ask({ kind: 'chooseTargets', title: 'Sacrifice which Skeleton?', data: { candidates: skels.map((s) => s.id), count: 1, upTo: false, kind: 'unit' } }, 'boneRaisePick', { cardId })
    },
  }]
}
