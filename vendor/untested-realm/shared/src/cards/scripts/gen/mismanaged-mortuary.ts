import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// -------------------------------------------------------- Mismanaged Mortuary ----
// 'Flooded. Treat your opponent's cemetery as yours, and vice versa.'
registerScript('Mismanaged Mortuary', {
  // Each Mortuary TOGGLES the swap — an even number cancels out (FAQ)
  genesis: (ctx) => {
    const site = ctx.state.sites[ctx.sourceId]
    if (!site) return
    site.flooded = true
    ctx.state.flow = ctx.state.flow ?? {}
    const a = ctx.state.players[0].cemetery
    ctx.state.players[0].cemetery = ctx.state.players[1].cemetery
    ctx.state.players[1].cemetery = a
    ctx.state.flow.mortuaries = [...(ctx.state.flow.mortuaries ?? []), site.id]
    const active = (ctx.state.flow.mortuaries as string[]).filter((id) => ctx.state.sites[id]).length % 2 === 1
    pushLog(ctx.state, ctx.controller, active
      ? '⚰️ The Mismanaged Mortuary files everyone in the wrong drawer — cemeteries are swapped!'
      : '⚰️ Two mortuaries mismanage each other — the paperwork cancels out.')
  },
  onSelfDestroyed: (ctx) => {
    const flow = ctx.state.flow
    if (!flow?.mortuaries?.includes(ctx.sourceId)) return
    flow.mortuaries = flow.mortuaries.filter((id: string) => id !== ctx.sourceId)
    if (!flow.mortuaries.length) delete flow.mortuaries
    const a = ctx.state.players[0].cemetery
    ctx.state.players[0].cemetery = ctx.state.players[1].cemetery
    ctx.state.players[1].cemetery = a
    pushLog(ctx.state, null, 'A mortuary closes — the filing changes hands again.')
  },
})
