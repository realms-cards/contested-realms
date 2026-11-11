import { registerScript, type EffectAPI } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'
import { playTopAtlasOntoRubble } from '../multi-card-utils/atlas-onto-rubble'

// 'Genesis → Play a site from the top of your atlas to an adjacent Rubble.'
// Adjacent: the Dryad's own square or one bordering it. With several Rubble, you choose which.
function adjacentRubble(ctx: EffectAPI) {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return []
  const adj = adjacentSquaresW(ctx.state, self.x, self.y)
  return Object.values(ctx.state.sites).filter((s) => s.isRubble && adj.some((a) => a.x === s.x && a.y === s.y))
}

registerScript('Emberleaf Dryad', {
  genesis: (ctx) => {
    const rubble = adjacentRubble(ctx)
    if (!rubble.length || !ctx.state.players[ctx.controller].atlas.length) return
    if (rubble.length === 1) return void playTopAtlasOntoRubble(ctx, rubble[0].id)
    ctx.ask({ kind: 'chooseSquare', title: 'Emberleaf Dryad: regrow which Rubble?', data: { squares: rubble.map((s) => ({ x: s.x, y: s.y })) } }, 'regrow')
  },
  conts: {
    regrow: (ctx, _c, sq) => {
      const r = sq ? adjacentRubble(ctx).find((s) => s.x === sq.x && s.y === sq.y) : undefined
      if (r) playTopAtlasOntoRubble(ctx, r.id)
    },
  },
})
