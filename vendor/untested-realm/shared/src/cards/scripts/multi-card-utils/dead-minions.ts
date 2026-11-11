import { getCard } from '../../db'
import { canPayZoneToll, payZoneToll } from '../../../engine/statics'
import type { EffectAPI } from '../registry'
import type { GameState, PlayerId } from '../../../engine/types'

/** "a dead minion" — any minion card in EITHER cemetery (rulebook; only "your dead" is yours) */
export function deadMinions(state: GameState): string[] {
  const out: string[] = []
  for (const pl of [0, 1] as PlayerId[]) {
    for (const id of state.players[pl].cemetery) {
      if (getCard(state.cards[id].name).type === 'Minion') out.push(id)
    }
  }
  return out
}

/** could `player` banish a dead minion now — one to banish, and the Bureau of Occult Control's toll for
 *  cemetery access affordable? (Gate an ability's `available` on it, so it isn't started in vain.) */
export function canBanishDeadMinion(state: GameState, player: PlayerId): boolean {
  return deadMinions(state).length > 0 && canPayZoneToll(state, player)
}

type DeadPick = (ctx: EffectAPI, c: Record<string, unknown>, choice: unknown) => void

/** ask which dead minion (either cemetery, each labelled with whose); the cont receives the picked index
 *  into `c.corpses`. With exactly one, `resolve` (the same cont function) takes it with no prompt. */
export function askDeadMinion(ctx: EffectAPI, title: string, contKey: string, extra: Record<string, unknown>, resolve: DeadPick): void {
  const corpses = deadMinions(ctx.state)
  if (!corpses.length) return
  if (corpses.length === 1) return resolve(ctx, { ...extra, corpses }, [0])
  const whose = (id: string) => (ctx.state.players[ctx.controller].cemetery.includes(id) ? 'your cemetery' : "opponent's cemetery")
  ctx.ask(
    { kind: 'chooseCards', title, data: { cards: corpses.map((id) => `${ctx.state.cards[id].name} (${whose(id)})`), pick: 1, upTo: false } },
    contKey,
    { ...extra, corpses },
  )
}

/** the card id a deadMinion pick answered, if it is still in a cemetery */
export function pickedDeadMinion(state: GameState, c: { corpses?: unknown }, choice: unknown): string | undefined {
  const idx = Array.isArray(choice) ? choice[0] : choice
  const dead = typeof idx === 'number' ? (c.corpses as string[] | undefined)?.[idx] : undefined
  return dead && state.players.some((pl) => pl.cemetery.includes(dead)) ? dead : undefined
}

/** banish a dead minion from whichever cemetery holds it (paying the Bureau of Occult Control's toll
 *  for cemetery access). False when it couldn't be banished. */
export function banishDeadMinion(ctx: EffectAPI, dead: string): boolean {
  if (!payZoneToll(ctx.state, ctx.controller)) {
    ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
    return false
  }
  for (const pl of [0, 1] as PlayerId[]) {
    const cem = ctx.state.players[pl].cemetery
    const i = cem.indexOf(dead)
    if (i >= 0) {
      cem.splice(i, 1)
      ctx.state.players[pl].banished.push(dead)
      return true
    }
  }
  return false
}
