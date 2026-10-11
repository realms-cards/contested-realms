import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Conjure a copy of an artifact carried by the caster.'
registerScript('Replication', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    const carried = caster.carrying.map((id) => ctx.state.artifacts[id]).filter(Boolean)
    if (!carried.length) return ctx.log('The caster carries nothing to replicate.')
    ctx.ask({ kind: 'chooseOption', title: 'Replicate which artifact?', data: { options: carried.map((a) => a!.name) } }, 'copy')
  },
  conts: {
    copy: (ctx, _c, choice) => {
      const caster = ctx.caster ?? Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)!
      if (typeof choice !== 'string') return
      const cardId = `c${ctx.state.nextId++}`
      ctx.state.cards[cardId] = { id: cardId, name: choice, owner: ctx.controller, isToken: true }
      const artId = `a${ctx.state.nextId++}`
      ctx.state.artifacts[artId] = {
        id: artId, cardId, name: choice, conjuredBy: ctx.controller,
        x: caster.x, y: caster.y, region: caster.region, carriedBy: null, tapped: false,
      }
      pushLog(ctx.state, ctx.controller, `A perfect copy of ${choice} shimmers into being.`)
    },
  },
})
