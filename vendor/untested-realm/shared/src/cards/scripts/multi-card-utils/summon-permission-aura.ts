import { siteAt } from '../../../engine/grid'
import type { CardScript } from '../registry'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

/** Shared behaviour for the "aura opens its covered sites to a category of minion" cards — Crusade,
 *  Jihad, Eclipse, Evil Presence, Summoning Sphere. Each one is the same shape:
 *    · its CONTROLLER may summon a QUALIFYING minion onto a site the aura covers (even an enemy's), and
 *    · (optionally) a qualifying ALLY standing on a covered, sited square gets +power.
 *  Only the two predicates (and the bonus amount) differ between the cards.
 *
 *  Note: validateSummonAt already guarantees a site exists at `at` before any auraAllowsSummon is
 *  consulted, so the permission only needs controller + covered-square (no site re-check). */
export function summonPermissionAura(opts: {
  /** which cards may be summoned onto a covered site (default: any minion) */
  canSummon?: (state: GameState, player: PlayerId, cardName: string) => boolean
  /** optional +power to a qualifying ALLY occupying a covered, sited square */
  bonus?: { applies: (state: GameState, unit: UnitState) => boolean; amount?: number }
}): Pick<CardScript, 'auraAllowsSummon' | 'auraGrantsPower'> {
  const canSummon = opts.canSummon ?? (() => true)
  const out: Pick<CardScript, 'auraAllowsSummon' | 'auraGrantsPower'> = {
    auraAllowsSummon: (state, aura, player, cardName, at) =>
      aura.controller === player && canSummon(state, player, cardName) &&
      aura.squares.some((s) => s.x === at.x && s.y === at.y),
  }
  if (opts.bonus) {
    const { applies, amount = 1 } = opts.bonus
    out.auraGrantsPower = (state, aura, unit) => {
      if (unit.controller !== aura.controller || unit.region !== 'surface') return 0
      if (!applies(state, unit)) return 0
      return aura.squares.some((s) => s.x === unit.x && s.y === unit.y && siteAt(state, s.x, s.y)) ? amount : 0
    }
  }
  return out
}
