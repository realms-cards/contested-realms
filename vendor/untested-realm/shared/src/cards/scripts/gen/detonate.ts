import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Destroy a minion or artifact you own or control. It explodes, dealing 3 damage
// to each unit at its location.'
registerScript('Detonate', {
  onCast: (ctx) => {
    // "a minion or artifact you OWN or control" — so a minion of yours an enemy has infiltrated (you
    // still OWN the card, they control it) is a legal Detonate target, as is a carried/ground artifact.
    const owns = (cardId: string) => ctx.state.cards[cardId]?.owner === ctx.controller
    const mine = Object.values(ctx.state.units)
      .filter((u) => !u.isAvatar && (u.controller === ctx.controller || owns(u.cardId))).map((u) => u.id)
    const arts = Object.values(ctx.state.artifacts)
      .filter((a) => (a.carriedBy ? ctx.state.units[a.carriedBy]?.controller : a.conjuredBy) === ctx.controller || owns(a.cardId))
      .map((a) => a.id)
    const candidates = [...mine, ...arts]
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Detonate what?', data: { candidates, count: 1, kind: 'unit' } }, 'boom')
  },
  conts: {
    boom: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (!id) return
      const u = ctx.state.units[id]
      const a = ctx.state.artifacts[id]
      const loc = u ?? a
      if (!loc) return
      const { x, y, region } = loc as any
      if (u) ctx.kill(u.id) // ward-aware: a warded minion sheds its ward instead (FAQ)
      if (a) ctx.breakArtifact(a.id)
      for (const v of unitsAt(ctx.state, x, y, region)) ctx.dealDamage({ unit: v.id }, 3)
      pushLog(ctx.state, ctx.controller, 'BOOM!')
    },
  },
})
