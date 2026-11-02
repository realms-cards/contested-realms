import { type CardScript, type EffectAPI } from '../registry'
import { pushLog, killUnit, checkStateBased, checkWard } from '../../../engine/effects'
import { siteAt, unitsAt } from '../../../engine/grid'
import { avgPower } from '../gen/minion-helpers'
import { removeAura } from './remove-aura'

// 'At the end of your turn, the weakest/strongest minion occupying affected
//  sites dies. If tied, choose one. Dispel if none die.'
export function plagueScript(name: string, strongest: boolean): CardScript {
  const passOn = (ctx: EffectAPI) => {
    removeAura(ctx)
    pushLog(ctx.state, ctx.controller, `${name} passes on.`)
  }
  // "dies" is a destruction: a ward breaks instead (any source, the plague's own controller's minions
  // too), and then no one died — so the plague is dispelled, as it is when no minion is there at all
  const succumb = (ctx: EffectAPI, unitId: string) => {
    const u = ctx.state.units[unitId]
    if (!u) return passOn(ctx)
    if (checkWard(ctx.state, u, ctx.controller, u.controller, 'destroy')) {
      pushLog(ctx.state, ctx.controller, `${u.name}'s ward breaks — no one succumbs to ${name}.`)
      return passOn(ctx)
    }
    killUnit(ctx.state, unitId)
    checkStateBased(ctx.state)
    if (ctx.state.units[unitId]) passOn(ctx)
  }
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
      if (!pool.length) return passOn(ctx)
      // weakest/strongest compare power — a split-power minion's is its average (rulebook)
      const powers = pool.map((u) => avgPower(ctx.state, u))
      const pick = strongest ? Math.max(...powers) : Math.min(...powers)
      const tied = pool.filter((u) => avgPower(ctx.state, u) === pick)
      if (tied.length === 1) return succumb(ctx, tied[0].id)
      // choosing among the tied isn't targeting: a warded pick breaks when it would die, in succumb
      ctx.ask({ kind: 'chooseTargets', title: `${name}: the ${strongest ? 'strongest' : 'weakest'} are tied — who succumbs?`, data: { candidates: tied.map((u) => u.id), count: 1, upTo: false, kind: 'unit', notTargeted: true } }, 'succumb')
    },
    conts: {
      succumb: (ctx, _c, choice) => {
        const id = Array.isArray(choice) ? choice[0] : choice
        if (typeof id === 'string') succumb(ctx, id)
      },
    },
  }
}
