import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { wardUnit } from '../../../engine/effects'

// 'Airborne, Ward / Genesis → Strike or Ward a nearby Avatar.'
registerScript('Archangel Raphael', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const avatars = Object.values(ctx.state.units).filter(
      (u) => u.isAvatar && nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y),
    )
    if (!avatars.length) return
    ctx.ask(
      { kind: 'chooseTargets', title: 'Raphael: choose a nearby Avatar', data: { candidates: avatars.map((u) => u.id), count: 1, kind: 'unit' } },
      'pickAvatar',
    )
  },
  conts: {
    pickAvatar: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (!id || !ctx.state.units[id]) return
      ctx.ask({ kind: 'chooseOption', title: 'Strike it, or Ward it?', data: { options: ['strike', 'ward'] } }, 'judgement', { avatarId: id })
    },
    judgement: (ctx, contCtx, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      const avatar = ctx.state.units[contCtx.avatarId]
      if (!self || !avatar) return
      if (choice === 'strike') ctx.strike(self, { unit: avatar.id })
      else wardUnit(ctx.state, avatar) // an Evil Avatar (not a minion) can still be warded
    },
  },
})
