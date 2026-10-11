import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Stealth / Tap â†’ Far East Assassin throws an artifact he carries at target
// adjacent unit. It takes damage equal to the artifact's mana cost.'
registerScript('Far East Assassin', {
  abilities: [{
    key: 'throw',
    label: 'Tap â†’ Throw a carried artifact',
    cost: { tap: true },
    targets: [{ what: 'unit', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent unit' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('unit' in t) || !self.carrying.length) return ctx.log('Nothing to throw.')
      const names = self.carrying.map((id) => ctx.state.artifacts[id]?.name ?? '?')
      ctx.ask({ kind: 'chooseOption', title: 'Throw which artifact?', data: { options: names } }, 'yeet', { victim: t.unit })
    },
  }],
  conts: {
    yeet: (ctx, contCtx, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      const victim = ctx.state.units[contCtx.victim]
      if (!self || !victim) return
      const artId = self.carrying.find((id) => ctx.state.artifacts[id]?.name === choice)
      if (!artId) return
      const art = ctx.state.artifacts[artId]!
      self.carrying = self.carrying.filter((id) => id !== artId)
      art.carriedBy = null
      art.x = victim.x
      art.y = victim.y
      art.region = victim.region
      ctx.dealDamage({ unit: victim.id }, getCard(art.name).cost ?? 0)
    },
  },
})
