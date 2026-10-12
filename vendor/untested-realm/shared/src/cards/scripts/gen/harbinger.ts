import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, randIndex } from '../../../engine/effects'
import { GRID_H, GRID_W, squareLabel } from '../../../engine/grid'
import { validateSummonAt } from '../../../engine/casting'
import type { GameState, PlayerId, Region } from '../../../engine/types'

// Would `name` be a LEGAL summon at `at` for `player` even WITHOUT the Harbinger
// power? We answer by temporarily flagging the power as spent this turn, which
// makes Harbinger's own `allowsSummonAt` grant return false — so validateSummonAt
// only says yes if some OTHER reason (a friendly site there, an open-house site,
// an aura grant…) makes the square castable. Pure/deterministic: restored before
// returning, all within one synchronous applyAction.
function summonableWithoutHarbinger(
  state: GameState,
  player: PlayerId,
  name: string,
  at: { x: number; y: number; region?: Region },
): boolean {
  state.flow = state.flow ?? {}
  const prev = state.flow.harbingerUsed
  state.flow.harbingerUsed = { ...(prev ?? {}), [player]: state.turn }
  const legal = validateSummonAt(state, player, name, at) === null
  if (prev === undefined) delete state.flow.harbingerUsed
  else state.flow.harbingerUsed = prev
  return legal
}

// 'On setup, determine three random squares. Once on your turn, you can cast a
//  minion to one of them and for (1) less.'
registerScript('Harbinger', {
  onSetup: (state, player) => {
    state.flow = state.flow ?? {}
    const squares: { x: number; y: number }[] = []
    while (squares.length < 3) {
      const n = randIndex(state, GRID_W * GRID_H)
      const sq = { x: n % GRID_W, y: Math.floor(n / GRID_W) }
      if (!squares.some((s) => s.x === sq.x && s.y === sq.y)) squares.push(sq)
    }
    state.flow.harbinger = { ...(state.flow.harbinger ?? {}), [player]: squares }
    pushLog(state, player, `The Harbinger's portents mark ${squares.map((s) => `${squareLabel(s.x, s.y)}`).join(', ')}.`)
  },
  allowsSummonAt: (state, player, at) => {
    if (state.flow?.harbingerUsed?.[player] === state.turn) return false
    const squares: { x: number; y: number }[] = state.flow?.harbinger?.[player] ?? []
    return squares.some((s) => s.x === at.x && s.y === at.y)
  },
  costModifier: (state, sourceId, caster, cardName, at) => {
    const self = state.units[sourceId]
    if (!self || !at || caster.controller !== self.controller) return 0
    if (getCard(cardName).type !== 'Minion') return 0
    if (state.flow?.harbingerUsed?.[self.controller] === state.turn) return 0
    const squares: { x: number; y: number }[] = state.flow?.harbinger?.[self.controller] ?? []
    return squares.some((s) => s.x === at.x && s.y === at.y) ? -1 : 0
  },
  // the portents are extra legal summon spots, so canCast can see the −1 there and a
  // minion only affordable with the discount (costs mana+1) isn't wrongly blocked.
  extraSummonSquares: (state, player) => {
    if (state.flow?.harbingerUsed?.[player] === state.turn) return []
    return state.flow?.harbinger?.[player] ?? []
  },
  // a CAST minion landing on a portent already got the −1 (costModifier). Whether
  // the player gets a CHOICE depends on the square:
  //  • If the square is ALSO a normal legal summon spot (a friendly site is there),
  //    the power is optional — casting here plainly is possible, so prompt to spend
  //    the power for the (1) discount or decline (pay full price, keep the power).
  //  • If the square is castable ONLY because of the Harbinger grant (void ground /
  //    no friendly site), the power is what made this cast legal at all — so it is
  //    spent automatically, no prompt. (Once spent, allowsSummonAt/extraSummonSquares
  //    stop offering the portents for the rest of the turn.)
  onUnitEnters: (ctx, entered) => {
    if (entered.controller !== ctx.controller || entered.isAvatar) return
    if (entered.enteredTurn !== ctx.state.turn || ctx.state.activePlayer !== ctx.controller) return
    if (ctx.state.flow?.harbingerUsed?.[ctx.controller] === ctx.state.turn) return
    if (ctx.state.cards[entered.cardId]?.isToken) return // tokens aren't cast — no cost to discount
    const squares: { x: number; y: number }[] = ctx.state.flow?.harbinger?.[ctx.controller] ?? []
    if (!squares.some((s) => s.x === entered.x && s.y === entered.y)) return
    ctx.state.flow = ctx.state.flow ?? {}
    const spend = () => {
      ctx.state.flow.harbingerUsed = { ...(ctx.state.flow.harbingerUsed ?? {}), [ctx.controller]: ctx.state.turn }
      pushLog(ctx.state, ctx.controller, "The Harbinger's portent is spent — a (1) discount.")
    }
    const name = ctx.state.cards[entered.cardId]?.name ?? entered.name
    const normal = summonableWithoutHarbinger(ctx.state, ctx.controller, name, { x: entered.x, y: entered.y, region: entered.region })
    if (!normal) return spend() // Harbinger-only square → power is automatic
    if ((ctx.state.players[ctx.controller].mana ?? 0) < 1) return spend() // can't pay the 1 back → forced
    ctx.ask(
      { kind: 'yesNo', title: `${entered.name} landed on a Harbinger portent — spend the power for a (1) discount? (No: pay full price, keep the power for later.)`, player: ctx.controller },
      'harbingerDiscount',
    )
  },
  conts: {
    harbingerDiscount: (ctx, _c, yes) => {
      ctx.state.flow = ctx.state.flow ?? {}
      if (yes) {
        ctx.state.flow.harbingerUsed = { ...(ctx.state.flow.harbingerUsed ?? {}), [ctx.controller]: ctx.state.turn }
        pushLog(ctx.state, ctx.controller, "The Harbinger's portent is spent — a (1) discount.")
      } else {
        ctx.spendMana(ctx.controller, 1) // pay full price back; the power stays available (counts as spent)
        pushLog(ctx.state, ctx.controller, 'The Harbinger holds its power in reserve — full price paid.')
      }
    },
  },
})
