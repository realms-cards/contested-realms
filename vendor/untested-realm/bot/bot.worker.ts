/// <reference lib="webworker" />
// Web Worker that runs the heavy SEARCH bot ("Thinking" difficulty) OFF the main thread, so the UI —
// the "computer is thinking" spinner, the chess clock, board animations — stays responsive while the
// computer plans. searchBotAction caches a full-turn plan in module state and replays it instantly for
// the rest of the turn, so only the FIRST action of a bot turn actually spends the time budget; because
// this worker is persistent, that module cache survives across messages exactly as in the mirror-test
// harness. Game state crosses the boundary as a JSON string (the same shape App already round-trips for
// its undo snapshots), which also sidesteps structured-clone's rejection of any stray functions.
import type { GameState, PlayerId, Action } from '@sorcery/shared'
import { searchBotAction, DEFAULT_SEARCH } from './bot_search'

export interface BotRequest {
  id: number
  state: string // JSON.stringify(GameState)
  seat: PlayerId
  timeBudgetMs: number
  banned?: string[] // anti-loop ward: action keys already proved score-neutral this turn (excluded)
}
export interface BotReply {
  id: number
  action?: Action
  error?: string
}

self.onmessage = (e: MessageEvent<BotRequest>) => {
  const { id, state, seat, timeBudgetMs, banned } = e.data
  let reply: BotReply
  try {
    const g = JSON.parse(state) as GameState
    const action = searchBotAction(g, seat, { ...DEFAULT_SEARCH, timeBudgetMs, banned: banned?.length ? new Set(banned) : undefined })
    reply = { id, action }
  } catch (err) {
    reply = { id, error: String((err as Error)?.message ?? err) }
  }
  ;(self as unknown as Worker).postMessage(reply)
}
