import { registerScript } from '../registry'
import { pushLog, removeUnitFromRealm } from '../../../engine/effects'

// 'Transform target nearby minion into a Frog token.'
registerScript('Pollimorph', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    const { x, y, region, controller } = u
    // transformed cards are removed from the game, not sent to the cemetery
    if (removeUnitFromRealm(ctx.state, u.id)) delete ctx.state.units[u.id] // cargo stays behind (FAQ); an avatar refuses removal
    pushLog(ctx.state, ctx.controller, `${u.name} turns into a Frog!`)
    const frog = ctx.summonToken('Frog', controller, x, y, region)
    if (frog) frog.enteredTurn = u.enteredTurn // no new summoning sickness
  },
})
