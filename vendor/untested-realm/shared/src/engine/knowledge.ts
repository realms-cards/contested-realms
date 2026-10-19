// What a player KNOWS about the order of a deck: the run of cards on top, and on the bottom, they've
// been shown and left there (the Seer's peek, Observatory's ordering, Black Mass's leftovers, …), most
// recent look per end. The effect that shows the cards records them; reads are VALIDATED against the
// live deck, so draws just shorten a known run, while anything that disturbs it unseen (a shuffle, a
// card put on top face down) drops it. Used by the bot so it plays with exactly the information a
// player would have — it must neither know more (deck order) nor forget what it has seen.

import type { GameState, PlayerId } from './types'
import { shuffleWithSeed } from './rng'

type Deck = 'spellbook' | 'atlas'
type End = 'top' | 'bottom'
/** who saw the cards: one player, or both (a public reveal). */
type Viewer = PlayerId | 'both'
const key = (viewer: PlayerId, owner: PlayerId, deck: Deck, end: End) => `${viewer}:${owner}:${deck}:${end}`

/** `viewer` has just seen `ids` sitting at the `end` of `owner`'s `deck`, in deck order (top first;
 *  for 'bottom' the LAST id is the very bottom). Replaces that viewer's previous knowledge of that end. */
export function noteKnownCards(state: GameState, viewer: Viewer, owner: PlayerId, deck: Deck, end: End, ids: string[]): void {
  state.flow = state.flow ?? {}
  const known: Record<string, string[]> = (state.flow.knownDeck = { ...(state.flow.knownDeck ?? {}) })
  for (const v of viewer === 'both' ? ([0, 1] as PlayerId[]) : [viewer]) {
    if (ids.length) known[key(v, owner, deck, end)] = [...ids]
    else delete known[key(v, owner, deck, end)]
  }
}

/** the run at `end` of `owner`'s `deck` that `viewer` still knows, in deck order ([] if none). Draws
 *  eat a top run from its front; for a bottom run they eat its front too once the deck gets that short. */
export function knownCards(state: GameState, viewer: PlayerId, owner: PlayerId, deck: Deck, end: End): string[] {
  const ids: string[] | undefined = state.flow?.knownDeck?.[key(viewer, owner, deck, end)]
  if (!ids?.length) return []
  const live = state.players[owner][deck]
  for (let k = 0; k < ids.length; k++) {
    const rest = ids.length - k
    if (rest > live.length) continue
    const at = end === 'top' ? 0 : live.length - rest
    let match = true
    for (let i = 0; match && i < rest; i++) if (live[at + i] !== ids[k + i]) match = false
    if (match) return ids.slice(k)
  }
  return []
}

/** Shuffle `owner`'s `deck` (seeded, as every deck shuffle must be) — and forget every player's
 *  knowledge of its order. Validation alone can't catch a shuffle that happens to leave a known card in
 *  place, so every deck shuffle goes through here. */
export function shuffleDeck(state: GameState, owner: PlayerId, deck: Deck): void {
  state.seed = shuffleWithSeed(state.players[owner][deck], state.seed)
  if (!state.flow?.knownDeck) return
  const known: Record<string, string[]> = (state.flow.knownDeck = { ...state.flow.knownDeck })
  for (const k in known) if (k.includes(`:${owner}:${deck}:`)) delete known[k]
}

/** call BEFORE `owner` draws the top card of `deck`: anyone else who knew that card was on top (a
 *  public reveal) still knows it once it's in the owner's hand — recorded as a hand reveal, exactly like
 *  a card shown from the hand. */
export function carryKnownTopIntoHand(state: GameState, owner: PlayerId, deck: Deck): void {
  const top = state.players[owner][deck][0]
  if (top === undefined) return
  for (const v of [0, 1] as PlayerId[]) {
    if (v === owner || knownCards(state, v, owner, deck, 'top')[0] !== top) continue
    state.handReveals = state.handReveals ?? {}
    const seen = state.handReveals[top] ?? (state.handReveals[top] = [])
    if (!seen.includes(v)) seen.push(v)
  }
}

const viewersOf =(viewer: Viewer): PlayerId[] => (viewer === 'both' ? [0, 1] : [viewer])

/** `mutate` puts `ids` (in deck order) onto the `end` of the deck — unshifted on top / pushed under the
 *  bottom. A run each viewer still knows at that end stays known: the new run is the new cards stacked
 *  on it (read BEFORE the mutation, while the old run is still at the very end). */
export function noteAddedToEnd(state: GameState, viewer: Viewer, owner: PlayerId, deck: Deck, end: End, ids: string[], mutate: () => void): void {
  const who = viewersOf(viewer)
  const prev = who.map((v) => [v, knownCards(state, v, owner, deck, end)] as const)
  mutate()
  for (const [v, run] of prev) noteKnownCards(state, v, owner, deck, end, end === 'top' ? [...ids, ...run] : [...run, ...ids])
  // a player who didn't see this placement no longer knows that end — even if the cards happen to land
  // back in the order they remembered (a private reorder), they can't know that
  for (const v of [0, 1] as PlayerId[]) if (!who.includes(v)) noteKnownCards(state, v, owner, deck, end, [])
}

/** `viewer` looked at `ids` where they already sit at the `end` of the deck (nothing moved). A longer
 *  run they already knew there is kept — both start (top) / finish (bottom) at the same end. */
export function noteSeenAtEnd(state: GameState, viewer: Viewer, owner: PlayerId, deck: Deck, end: End, ids: string[]): void {
  for (const v of viewersOf(viewer)) {
    const run = knownCards(state, v, owner, deck, end)
    noteKnownCards(state, v, owner, deck, end, run.length > ids.length ? run : ids)
  }
}
