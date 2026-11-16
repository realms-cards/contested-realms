import type { GameState, PlayerId } from '../../../engine/types'
import type { EffectAPI } from '../registry'
import { notePermafrostHold } from '../../../engine/statics'

/** "…is disabled until your next turn" (Freeze, Frost Nova, Frozen Horror, Psionic Blast, Frostbolt,
 *  Frost Elemental, the Frost Mage's ice, Avalanche): a disabled marker that the start of `player`'s
 *  next turn removes. Avatars are never disabled. Returns whether the unit was marked.
 *  Pass the effect's `ctx` (player defaults to its controller) so a unit Protected from that source
 *  (Humming Hummocks: a Magic, site, artifact or aura) is spared; a bare `state` skips that check.
 *  A minion at a Permafrost is held disabled at once (statics.notePermafrostHold). */
export function disableUntilYourNextTurn(src: GameState | EffectAPI, unitId: string, player?: PlayerId): boolean {
  const ctx = 'shields' in src ? src : undefined
  const state = ctx ? ctx.state : (src as GameState)
  const u = state.units[unitId]
  if (!u || u.isAvatar) return false
  if (ctx?.shields(unitId)) return false
  u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: state.turn, sourcePlayer: player ?? ctx!.controller })
  notePermafrostHold(state, u)
  return true
}
