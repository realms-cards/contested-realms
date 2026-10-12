import { registerScript } from '../registry'

// 'Teleport any number of allied minions to the caster's location.'
registerScript('Recall', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    const mine = Object.values(ctx.state.units)
      .filter((u) => u.controller === ctx.controller && !u.isAvatar && !(u.x === caster.x && u.y === caster.y && u.region === caster.region))
      .map((u) => u.id)
    if (!mine.length) return ctx.log('No minions to recall.')
    ctx.ask({ kind: 'chooseTargets', title: 'Recall which minions?', data: { candidates: mine, count: mine.length, upTo: true, kind: 'unit' } }, 'recall')
  },
  conts: {
    recall: (ctx, _c, choice) => {
      const caster = ctx.caster ?? Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)!
      const ids = Array.isArray(choice) ? choice : []
      for (const id of ids) {
        const u = ctx.state.units[id]
        if (u && u.controller === ctx.controller && !u.isAvatar) ctx.teleport(u.id, caster.x, caster.y, caster.region)
      }
    },
  },
})
