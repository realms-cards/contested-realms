import { registerScript, type EffectAPI } from '../registry'
import { getCard, getKeywords } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { cemeteryProtected, payZoneToll } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'Genesis → Summon each other dead Voidwalk minion to a nearby site or void.'
// The dead Voidwalk minions are fixed when the Genesis resolves (one Bureau toll for the whole effect);
// the controller chooses the ORDER they rise in (their Genesis abilities resolve in that order) and
// where each one lands. The fixed set is CLAIMED (flow.horrorClaimed) so a Horror risen mid-chain doesn't
// offer the same dead minion again from its own Genesis.
registerScript('Ultimate Horror', {
  genesis: (ctx) => {
    const claimed = claims(ctx)
    const queue: string[] = []
    for (const pid of [0, 1] as PlayerId[]) {
      if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
      for (const id of ctx.state.players[pid].cemetery) {
        const name = ctx.state.cards[id].name
        if (getCard(name).type === 'Minion' && getKeywords(name).voidwalk && !claimed.includes(id)) queue.push(id)
      }
    }
    if (!queue.length) return
    if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
    ctx.state.flow.horrorClaimed = [...claimed, ...queue]
    horrorNext(ctx, queue)
  },
  conts: {
    pick: (ctx, c, choice) => {
      const queue = c.queue as string[]
      const idx = Array.isArray(choice) ? choice[0] : choice
      const cardId = typeof idx === 'number' ? queue[idx] : undefined
      if (!cardId) return
      askSquare(ctx, cardId, queue.filter((id) => id !== cardId))
    },
    rise: (ctx, c, sq) => {
      const cardId = c.cardId as string
      ctx.state.flow.horrorClaimed = claims(ctx).filter((id) => id !== cardId) // risen (or gone): released
      // the dead minion lies in its owner's cemetery (either player's); it rises under OUR control
      const cem = ctx.state.players[ctx.state.cards[cardId].owner].cemetery
      const self = ctx.state.units[ctx.sourceId]
      if (sq && self && cem.includes(cardId) && nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) {
        cem.splice(cem.indexOf(cardId), 1)
        const name = ctx.state.cards[cardId].name
        const unitId = `u${ctx.state.nextId++}`
        const region = siteAt(ctx.state, sq.x, sq.y) ? 'surface' : 'void'
        // each dead Voidwalk minion re-enters the realm → its Genesis fires (FAQ 1242)
        effectSummonUnit(ctx.state, {
          id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
          isAvatar: false, x: sq.x, y: sq.y, region, tapped: false, damage: 0,
          enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        })
        pushLog(ctx.state, ctx.controller, `${name} crawls back from beyond.`)
      }
      horrorNext(ctx, c.queue as string[])
    },
  },
})

const claims = (ctx: EffectAPI): string[] => ctx.state.flow?.horrorClaimed ?? []
const label = (ctx: EffectAPI, id: string) => `${ctx.state.cards[id].name} (${ctx.state.players[ctx.state.cards[id].owner].name})`

/** the next dead minion to rise: ask which one when there's a choice */
function horrorNext(ctx: EffectAPI, queue: string[]): void {
  // one that already left its cemetery (an earlier riser's Genesis moved it) no longer rises
  const left = ctx.state.units[ctx.sourceId] ? queue.filter((id) => ctx.state.players[ctx.state.cards[id].owner].cemetery.includes(id)) : []
  // whatever won't rise any more is released
  ctx.state.flow.horrorClaimed = claims(ctx).filter((id) => !queue.includes(id) || left.includes(id))
  if (!left.length) return
  if (left.length === 1) return askSquare(ctx, left[0], [])
  ctx.ask(
    { kind: 'chooseCards', title: 'Which dead Voidwalk minion rises next?', data: { cards: left.map((id) => label(ctx, id)), pick: 1, upTo: false } },
    'pick',
    { queue: left },
  )
}

function askSquare(ctx: EffectAPI, cardId: string, rest: string[]): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const squares = nearbySquaresW(ctx.state, self.x, self.y)
  ctx.ask({ kind: 'chooseSquare', title: `Summon ${label(ctx, cardId)} to which nearby site or void?`, data: { squares } }, 'rise', { cardId, queue: rest })
}
