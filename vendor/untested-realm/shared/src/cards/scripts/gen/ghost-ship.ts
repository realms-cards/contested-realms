import { registerScript } from '../registry'
import { getCard } from '../../db'
import { effectSummonUnit } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Voidwalk / Whenever Ghost Ship enters a site from the void, you may summon a
// Spirit from any cemetery to its location.'
registerScript('Ghost Ship', {
  onUnitEntersSquare: (ctx, moved, from) => {
    if (moved.id !== ctx.sourceId) return
    if (from.region !== 'void' || moved.region !== 'surface') return
    // "you MAY summon a Spirit from ANY cemetery" — offer EVERY Spirit across both
    // cemeteries so the controller chooses which one (and may decline).
    const cands: { pid: PlayerId; cardId: string }[] = []
    for (const pid of [ctx.controller, (1 - ctx.controller) as PlayerId]) {
      for (const id of ctx.state.players[pid].cemetery) {
        if (getCard(ctx.state.cards[id].name).subtypes.includes('Spirit')) cands.push({ pid, cardId: id })
      }
    }
    if (cands.length === 0) return
    ctx.ask({ kind: 'chooseCards', title: 'Summon which Spirit from a cemetery? (you may decline)', data: { cards: cands.map((c) => ctx.state.cards[c.cardId].name), pick: 1, upTo: true } }, 'haunt', { cands })
  },
  conts: {
    haunt: (ctx, contCtx, choice) => {
      const idxs = Array.isArray(choice) ? choice : []
      const i = typeof idxs[0] === 'number' ? idxs[0] : -1
      const pick = i >= 0 ? (contCtx.cands as { pid: PlayerId; cardId: string }[])[i] : null
      if (!pick) return
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const p = ctx.state.players[pick.pid]
      const ci = p.cemetery.indexOf(pick.cardId)
      if (ci < 0) return
      p.cemetery.splice(ci, 1)
      const cardId = pick.cardId
      const unitId = `u${ctx.state.nextId++}`
      // reanimated into the realm → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name: ctx.state.cards[cardId].name, owner: ctx.state.cards[cardId].owner,
        controller: ctx.controller, isAvatar: false, x: self.x, y: self.y, region: self.region,
        tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
        carryingUnits: [], usedThisTurn: {},
      })
    },
  },
})
