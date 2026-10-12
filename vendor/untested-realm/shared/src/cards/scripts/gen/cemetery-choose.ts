import type { EffectAPI } from '../registry'
import type { PlayerId } from '../../../engine/types'

// "Banish N cards from a cemetery" lets the ACTIVE player pick WHICH cards — a cemetery is a public,
// UNORDERED pile, so an effect must never auto-pick the oldest via `cemetery.shift()`. These helpers
// raise the chooser and resolve it by card id (multiple same-named cards are disambiguated by id).

/** Raise a chooseCards prompt for banishing from `pid`'s cemetery, routed to `contKey` with ctx
 *  { pid, ids, ...extra }. `max` cards (fewer if the cemetery is smaller); `upTo` allows taking fewer.
 *  Returns false — asking nothing — if the cemetery is empty (the caller decides what to do then). */
export function askBanishFromCemetery(
  ctx: EffectAPI,
  pid: PlayerId,
  max: number,
  upTo: boolean,
  contKey: string,
  extra: Record<string, unknown> = {},
): boolean {
  const ids = [...ctx.state.players[pid].cemetery]
  if (!ids.length) return false
  ctx.ask(
    {
      kind: 'chooseCards',
      title: `Banish which from ${ctx.state.players[pid].name}'s cemetery?`,
      data: { cards: ids.map((id) => ctx.state.cards[id].name), pick: Math.min(max, ids.length), upTo },
    },
    contKey,
    { pid, ids, ...extra },
  )
  return true
}

/** Resolve the chooseCards answer (an array of selected indices into `c.ids`): move the chosen
 *  cemetery cards to their owner's banished pile. Returns the banished ids. */
export function resolveBanishFromCemetery(ctx: EffectAPI, c: { pid: PlayerId; ids?: string[] }, choice: unknown): string[] {
  const ids = c.ids ?? []
  const picks = (Array.isArray(choice) ? choice : []) as number[]
  const chosen = picks.map((i) => ids[i]).filter((id): id is string => typeof id === 'string')
  const p = ctx.state.players[c.pid]
  for (const id of chosen) {
    const idx = p.cemetery.indexOf(id)
    if (idx >= 0) {
      p.cemetery.splice(idx, 1)
      p.banished.push(id)
    }
  }
  return chosen
}
