// Chess-style clock helpers. The engine holds only numeric time (ClockState on
// GameState); these helpers do the time arithmetic but never read the wall clock
// themselves — the authority layer (server for online, client for local play)
// supplies `now`, keeping applyAction fully deterministic.

import type { GameState, PlayerId } from './types'
import { actingSeatFor } from './game'
import { opponent, pushLog } from './effects'

/**
 * Whose clock is running right now = the seat the game is waiting on. This makes
 * "attack declared → opponent must choose to defend → opponent's clock burns"
 * fall out for free: the defend prompt is addressed to the opponent, so they are
 * the running seat. No clock runs during mulligan, once the game is over, or in
 * an untimed game.
 */
export function runningSeat(state: GameState): PlayerId | null {
  if (!state.clock || state.phase === 'over' || state.phase === 'mulligan') return null
  if (state.interject) return actingSeatFor(state, state.interject.player)
  const p = state.prompts[0]
  if (p) return actingSeatFor(state, p.player)
  return actingSeatFor(state, state.activePlayer)
}

/**
 * Deduct real elapsed time (now - lastTick) from the seat currently on the clock.
 * `now`/`lastTick` are milliseconds supplied by the caller; the engine never calls
 * Date.now itself. Safe to call repeatedly (idempotent given the same timestamps).
 */
export function settleClock(state: GameState, lastTick: number, now: number): void {
  if (!state.clock) return
  const seat = runningSeat(state)
  if (seat === null) return
  const elapsed = Math.max(0, now - lastTick)
  state.clock.remaining[seat] = Math.max(0, state.clock.remaining[seat] - elapsed)
}

/** a player's flag falls — they lose the game on time. */
export function flagFall(state: GameState, player: PlayerId): void {
  if (state.phase === 'over') return
  state.winner = opponent(player)
  state.phase = 'over'
  pushLog(state, player, `⏱ ${state.players[player].name} runs out of time — ${state.players[opponent(player)].name} wins.`)
}
