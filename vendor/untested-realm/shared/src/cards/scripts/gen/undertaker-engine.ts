import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'At the end of your turn, you may burrow and/or unburrow any combination of
//  artifacts and minions at this site.'
registerScript('Undertaker Engine', {
  endOfTurn: (ctx) => undertake(ctx, []),
  conts: {
    dig: (ctx, c, yes) => {
      const done = c.done as string[]
      const id = c.entityId as string
      if (yes) {
        const u = ctx.state.units[id]
        const a = ctx.state.artifacts[id]
        if (u && !u.isAvatar) u.region = u.region === 'surface' ? 'underground' : 'surface'
        if (a) a.region = a.region === 'surface' ? 'underground' : 'surface'
        pushLog(ctx.state, ctx.controller, `The Engine churns the earth around ${(u ?? a)?.name}.`)
      }
      undertake(ctx, [...done, id])
    },
  },
})

function undertake(ctx: EffectAPI, done: string[]): void {
  const art = ctx.state.units[ctx.sourceId]
  if (!art) return
  const here = [
    ...unitsAt(ctx.state, art.x, art.y).filter((u) => !u.isAvatar),
    ...Object.values(ctx.state.artifacts).filter((a) => !a.carriedBy && a.x === art.x && a.y === art.y && a.id !== art.id),
  ].filter((e) => !done.includes(e.id) && (e.region === 'surface' || e.region === 'underground'))
  const next = here[0]
  if (!next) return
  const verb = next.region === 'surface' ? 'Burrow' : 'Unburrow'
  ctx.ask({ kind: 'yesNo', title: `Undertaker Engine: ${verb} ${next.name}?` }, 'dig', { entityId: next.id, done })
}
