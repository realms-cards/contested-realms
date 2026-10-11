import { registerScript } from '../registry'
import { allCards } from '../../db'
import { pushLog, opponent, pushPrompt, registerCont, luckyChoiceIndex, luckyCandidates } from '../../../engine/effects'
import { effectCastSpell } from '../../../engine/casting'
import type { GameState, PlayerId } from '../../../engine/types'

// 'Cast a copy of a random spell for free, ignoring threshold, then the next
//  player may copy Chaoswish.'
//
// "Cast a copy" means CAST it — resolve it through the real pipeline (prompting
// for its own targets), never drop a token in hand. And "the next player may
// copy" is an OUT-OF-TURN optional action (a yes/no to the opponent), not a card
// deposited in their hand where they couldn't legally cast it on your turn.
const spellPool = () => allCards.filter((c) => c.type !== 'Site' && c.type !== 'Avatar')

// Safety cap on the copy chain: "the next player may copy" alternates, so two
// always-accepting responders (the bot answers every yes/no 'yes'!) would loop
// forever and hang the game. The FAQ resolves this by "specify a number of
// times" — we bound it. `depth` rides the continuation ctx (no flow state).
const CHAOSWISH_MAX_COPIES = 12

registerScript('Chaoswish', {
  conts: {
    // Lucky Charm / Kythera resolved the "random" pick → cast that spell for real
    chaos: (ctx, c, choice) => {
      const name = (c.__opts as string[])[luckyChoiceIndex(c, choice)]
      effectCastSpell(ctx.state, ctx.controller, name, { afterKey: 'chaoswish:pass', afterCtx: { from: ctx.controller, depth: 0 } })
    },
  },
  onCast: (ctx) => {
    const pick = ctx.lucky(spellPool().map((c) => ({ label: c.name, payload: c.name })), 'chaos', 'cards')
    if (pick !== undefined) effectCastSpell(ctx.state, ctx.controller, pick as string, { afterKey: 'chaoswish:pass', afterCtx: { from: ctx.controller, depth: 0 } })
  },
})

// after a Chaoswish (or a copy of it) resolves, the NEXT player may copy it —
// an out-of-turn optional prompt. Accept → cast a random spell free and pass on.
registerCont('chaoswish:pass', (state: GameState, ctx: { from: PlayerId; depth: number }) => {
  if (ctx.depth >= CHAOSWISH_MAX_COPIES) { pushLog(state, ctx.from, 'The wish is spent.'); return }
  const next = opponent(ctx.from)
  pushPrompt(state, {
    player: next,
    kind: 'yesNo',
    title: 'The wish echoes — copy Chaoswish? (cast a copy of a random spell, free)',
    data: {},
    cont: 'chaoswish:copy',
    ctx: { who: next, depth: ctx.depth },
  })
})

registerCont('chaoswish:copy', (state: GameState, ctx: { who: PlayerId; depth: number }, choice) => {
  if (choice !== true) { pushLog(state, ctx.who, 'The wish fades.'); return }
  pushLog(state, ctx.who, `${state.players[ctx.who].name} copies Chaoswish!`)
  // the "random" spell honours the copier's luck — Lucky Charm (roll N+1, they
  // choose) and Kythera/Black Cat (a determiner chooses freely), same as the
  // caster's own pick via ctx.lucky. luckyCandidates is source-independent.
  const r = luckyCandidates(state, ctx.who, spellPool().map((c) => ({ label: c.name, payload: c.name })))
  if (!r.choose) {
    if (typeof r.payload === 'string') doChaoswishCopy(state, ctx.who, r.payload, ctx.depth)
    return
  }
  pushPrompt(state, {
    player: r.chooser,
    kind: 'chooseCards',
    title: r.chooser === ctx.who ? 'Lucky Charm: choose the copied spell' : `Fate bends: determine ${state.players[ctx.who].name}'s copied spell`,
    data: { cards: r.options.map((o) => o.label), pick: 1, upTo: false },
    cont: 'chaoswish:luckpick',
    ctx: { who: ctx.who, depth: ctx.depth, __opts: r.options.map((o) => o.payload as string), __labels: r.options.map((o) => o.label) },
  })
})

registerCont('chaoswish:luckpick', (state: GameState, ctx: { who: PlayerId; depth: number; __opts: string[]; __labels: string[] }, choice) => {
  const name = ctx.__opts[luckyChoiceIndex(ctx, choice)]
  if (name) doChaoswishCopy(state, ctx.who, name, ctx.depth)
})

function doChaoswishCopy(state: GameState, who: PlayerId, name: string, depth: number): void {
  effectCastSpell(state, who, name, { afterKey: 'chaoswish:pass', afterCtx: { from: who, depth: depth + 1 } })
}
