import type { GameState, PlayerId } from '../../../engine/types'

/** "…is disabled until your next turn" (Freeze, Frost Nova, Frozen Horror, Psionic Blast, Frostbolt,
 *  Frost Elemental, the Frost Mage's ice, Avalanche): a disabled marker that the start of `player`'s
 *  next turn removes. Avatars are never disabled. Returns whether the unit was marked. */
export function disableUntilYourNextTurn(state: GameState, unitId: string, player: PlayerId): boolean {
  const u = state.units[unitId]
  if (!u || u.isAvatar) return false
  u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: state.turn, sourcePlayer: player })
  return true
}
