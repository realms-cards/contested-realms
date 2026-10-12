import { registerScript, type EffectAPI } from '../registry'
import { killUnit, checkStateBased } from '../../../engine/effects'

// 'Genesis → Sacrifice a minion or Slobbermaw deals 4 damage to you.'
registerScript('Slobbermaw', {
  genesis: (ctx) => {
    const mine = Object.values(ctx.state.units)
      .filter((u) => u.controller === ctx.controller && !u.isAvatar && u.id !== ctx.sourceId)
      .map((u) => u.id)
    if (!mine.length) return slobberBite(ctx)
    ctx.ask({ kind: 'chooseTargets', title: 'Feed which minion to the Slobbermaw? (skip to take 4 damage)', data: { candidates: mine, count: 1, upTo: true, kind: 'unit' } }, 'feed')
  },
  conts: {
    feed: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && ctx.state.units[id]) {
        killUnit(ctx.state, id)
        checkStateBased(ctx.state)
      } else {
        slobberBite(ctx)
      }
    },
  },
})

function slobberBite(ctx: EffectAPI): void {
  const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
  if (avatar) ctx.dealDamage({ unit: avatar.id }, 4)
}
