import { registerScript } from '../registry'

// 'This turn, attacks against target Avatar can't be defended and you draw a
// card whenever they are attacked.'
registerScript('Kiss of Judas', {
  targets: [{ what: 'avatar', count: 1, targeted: true, owner: 'any', label: 'target Avatar' }],
  onCast: (ctx) => {
    const ref = ctx.targets[0]
    if (!ref || !('unit' in ref)) return
    const avatar = ctx.state.units[ref.unit]
    if (!avatar) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.judasKiss = ctx.state.flow.judasKiss ?? []
    ctx.state.flow.judasKiss.push({ avatarId: avatar.id, byPlayer: ctx.controller })
    ctx.log(`${avatar.name} is marked by the Kiss of Judas.`)
  },
})
