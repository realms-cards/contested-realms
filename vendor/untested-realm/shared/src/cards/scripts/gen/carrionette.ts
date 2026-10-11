import { registerScript } from '../registry'
import { getCard } from '../../db'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { cardSubtypesFor } from '../../../engine/statics'
import { effectSummonUnit } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Summon an Undead from a cemetery to a nearby location.'
registerScript('Carrionette', {
  onCast: (ctx) => {
    const options: string[] = []
    for (const p of ctx.state.players) {
      for (const id of p.cemetery) {
        const n = ctx.state.cards[id].name
        // "Undead" honors a Corruptor on the cemetery's owner (your Mortals are Undead).
        if (getCard(n).type === 'Minion' && cardSubtypesFor(ctx.state, p.id, n).includes('Undead')) options.push(n)
      }
    }
    if (!options.length) return ctx.log('No Undead to raise.')
    ctx.ask({ kind: 'chooseOption', title: 'Raise which Undead?', data: { options: [...new Set(options)] } }, 'raise')
  },
  conts: {
    raise: (ctx, _c, choice) => {
      const caster = ctx.caster!
      const spots = nearbySquaresW(ctx.state, caster.x, caster.y).filter((s) => siteAt(ctx.state, s.x, s.y)).map((s) => siteAt(ctx.state, s.x, s.y)!.id)
      if (!spots.length) return
      ctx.ask({ kind: 'chooseTargets', title: 'Summon it to which nearby site?', data: { candidates: spots, count: 1, kind: 'site' } }, 'place', { name: choice })
    },
    place: (ctx, contCtx, choice) => {
      const siteId = Array.isArray(choice) ? choice[0] : choice
      const site = ctx.state.sites[siteId]
      if (!site) return
      for (const pid of [0, 1] as PlayerId[]) {
        const p = ctx.state.players[pid]
        const idx = p.cemetery.findIndex((id) => ctx.state.cards[id].name === contCtx.name)
        if (idx >= 0) {
          const [cardId] = p.cemetery.splice(idx, 1)
          const unitId = `u${ctx.state.nextId++}`
          // reanimated into the realm → Genesis fires (FAQ 1242)
          effectSummonUnit(ctx.state, {
            id: unitId, cardId, name: contCtx.name, owner: ctx.state.cards[cardId].owner,
            controller: ctx.controller, isAvatar: false, x: site.x, y: site.y, region: 'surface',
            tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
            carryingUnits: [], usedThisTurn: {},
          })
          return
        }
      }
    },
  },
})
