import { registerScript } from '../registry'
import { getCard } from '../../db'
import { nearbySquaresW } from '../../../engine/grid'

// 'Genesis → You may destroy all Weapons and Armor nearby.'
registerScript('Bonfire', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'yesNo', title: 'Bonfire: burn all Weapons and Armor nearby?' }, 'burn')
  },
  conts: {
    burn: (ctx, _c, choice) => {
      if (!choice) return
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      for (const a of Object.values(ctx.state.artifacts)) {
        const def = getCard(a.name)
        if ((def.subtypes.includes('Weapon') || def.subtypes.includes('Armor')) && nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === a.x && s.y === a.y)) {
          ctx.breakArtifact(a.id)
        }
      }
    },
  },
})
