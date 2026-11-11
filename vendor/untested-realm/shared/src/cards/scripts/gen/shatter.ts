import { registerScript } from '../registry'
import { isArtifactUnit, isDisabled } from '../../../engine/statics'

// 'Destroy a nearby target artifact or disabled minion.' (An Automaton is an artifact too.)
registerScript('Shatter', {
  targets: [{
    what: 'minionOrArtifact', count: 1, targeted: true, where: 'nearby', label: 'target nearby artifact or disabled minion',
    filter: (state, cand) => !state.units[cand?.id] || isDisabled(state, cand) || isArtifactUnit(state, cand),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t) return
    if ('artifact' in t && ctx.state.artifacts[t.artifact]) ctx.breakArtifact(t.artifact)
    else if ('unit' in t && ctx.state.units[t.unit]) ctx.kill(t.unit)
  },
})
