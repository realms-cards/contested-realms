import { getScript } from '../registry'
import type { GameState, PlayerId } from '../../../engine/types'
import { makeCtx, pushLog, bumpManaSpent, beginAreaReveal, sealAbilityReveal, runDamageEvent, checkStateBased } from '../../../engine/effects'
import { affinity, siteSilenced } from '../../../engine/statics'

/** A FACE-UP trap site's trap ability (its siteTrapAbility), or undefined. A face-down trap isn't
 *  reactivated: activating it is its normal spring. */
export function sprungTrapAbility(state: GameState, siteId: string) {
  const site = state.sites[siteId]
  if (!site || site.trap || site.isRubble) return undefined
  return getScript(site.name)?.siteTrapAbility
}

/** Why `player` can't reactivate the trap at `siteId` for `discount` less, or null. Codex (Trap): "To
 *  reactivate a trap means to activate its trap ability while it is face-up, paying the mana and
 *  controlling the effect while it is resolving"; a silenced or disabled trap can't be activated. */
export function reactivateProblem(state: GameState, player: PlayerId, siteId: string, discount: number): string | null {
  const ta = sprungTrapAbility(state, siteId)
  const site = state.sites[siteId]
  if (!ta || !site) return 'Not a face-up trap.'
  if (siteSilenced(state, site)) return `${site.name} is silenced.`
  if (state.players[player].mana < Math.max(0, (ta.cost.mana ?? 0) - discount)) return 'Not enough mana.'
  const have = affinity(state, player)
  for (const el of ['air', 'earth', 'fire', 'water'] as const) {
    if ((ta.threshold?.[el] ?? 0) > have[el]) return 'Elemental threshold not met.'
  }
  if (ta.available && !ta.available(state, siteId, player)) return `${site.name} has nothing to work on.`
  return null
}

/** Reactivate a face-up trap (Trapper's Rest): pay its mana less `discount`, then resolve its trap
 *  effect under `player`'s control, revealed to both players like a spring. */
export function reactivateTrap(state: GameState, player: PlayerId, siteId: string, discount: number): boolean {
  if (reactivateProblem(state, player, siteId, discount)) return false
  const ta = sprungTrapAbility(state, siteId)!
  const site = state.sites[siteId]
  const cost = Math.max(0, (ta.cost.mana ?? 0) - discount)
  state.players[player].mana -= cost
  bumpManaSpent(state, player, cost)
  pushLog(state, player, `${state.players[player].name} reactivates ${site.name}.`)
  beginAreaReveal(state, undefined, site.name, siteId)
  runDamageEvent(state, () => ta.effect(makeCtx(state, siteId, player, [])))
  checkStateBased(state)
  sealAbilityReveal(state, `trap activates: ${site.name}`)
  return true
}
