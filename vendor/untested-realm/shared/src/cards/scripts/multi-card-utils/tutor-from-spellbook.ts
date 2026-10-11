import { type EffectAPI } from '../registry'
import { searchLimit } from '../../../engine/statics'
import { pushLog, revealCards } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

/** tutor: move matching cards from spellbook to hand via a chooseOption ask
 *  (Haystack: enemies of its controller only search the top three cards) */
export function tutorFromSpellbook(ctx: EffectAPI, label: string, filter: (name: string) => boolean) {
  const p = ctx.state.players[ctx.controller]
  const window = searchLimit(ctx.state, ctx.controller)
  const pool = window === Infinity ? p.spellbook : p.spellbook.slice(0, window)
  if (window !== Infinity) ctx.log(`Haystack: only the top ${window} cards can be searched.`)
  const matches = [...new Set(pool.map((id) => ctx.state.cards[id].name).filter(filter))]
  if (!matches.length) {
    ctx.log('No matching card in the spellbook.')
    ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
    return
  }
  ctx.ask({ kind: 'chooseOption', title: label, data: { options: matches } }, 'tutorPick')
}

export const tutorCont = (filterCheck?: (name: string) => boolean) => (ctx: EffectAPI, _c: any, choice: any) => {
  const p = ctx.state.players[ctx.controller]
  const window = searchLimit(ctx.state, ctx.controller)
  const idx = p.spellbook.findIndex((id, i) => (window === Infinity || i < window) && ctx.state.cards[id].name === choice)
  if (idx >= 0 && (!filterCheck || filterCheck(String(choice)))) {
    const [id] = p.spellbook.splice(idx, 1)
    p.hand.push(id)
    pushLog(ctx.state, ctx.controller, `${p.name} reveals ${choice} and puts it into their hand.`)
    revealCards(ctx.state, ctx.controller, [String(choice)]) // opponent sees a "revealed" popup
  }
  ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
}
