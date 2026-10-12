import { type CardScript } from '../registry'
import { pushLog, killUnit, checkStateBased, toCemetery } from '../../../engine/effects'
import { siteAt, unitsAt } from '../../../engine/grid'
import { effAttack } from '../../../engine/statics'

// 'At the end of your turn, the weakest/strongest minion occupying affected
//  sites dies. If tied, choose one. Dispel if none die.'
export function plagueScript(name: string, strongest: boolean): CardScript {
  return {
    endOfTurn: (ctx) => {
      const aura = ctx.state.auras[ctx.sourceId]
      if (!aura) return
      // The plague afflicts each affected SITE, not just its surface — a minion
      // burrowed underground or submerged underwater on an affected site is on that
      // site too, so it can succumb. (Void is off-site: a void unit isn't on a site.)
      const pool = aura.squares
        .filter((s) => siteAt(ctx.state, s.x, s.y))
        .flatMap((s) => unitsAt(ctx.state, s.x, s.y).filter((u) => u.region !== 'void'))
        .filter((u) => !u.isAvatar)
      if (!pool.length) {
        const card = ctx.state.cards[aura.cardId]
        if (card) toCemetery(ctx.state, card.id)
        delete ctx.state.auras[ctx.sourceId]
        pushLog(ctx.state, ctx.controller, `${name} passes on.`)
        return
      }
      const powers = pool.map((u) => effAttack(ctx.state, u))
      const pick = strongest ? Math.max(...powers) : Math.min(...powers)
      const tied = pool.filter((u) => effAttack(ctx.state, u) === pick)
      if (tied.length === 1) {
        killUnit(ctx.state, tied[0].id)
        checkStateBased(ctx.state)
        return
      }
      ctx.ask({ kind: 'chooseTargets', title: `${name}: the ${strongest ? 'strongest' : 'weakest'} are tied — who succumbs?`, data: { candidates: tied.map((u) => u.id), count: 1, upTo: false, kind: 'unit' } }, 'succumb')
    },
    conts: {
      succumb: (ctx, _c, choice) => {
        const id = Array.isArray(choice) ? choice[0] : choice
        if (typeof id === 'string' && ctx.state.units[id]) {
          killUnit(ctx.state, id)
          checkStateBased(ctx.state)
        }
      },
    },
  }
}
