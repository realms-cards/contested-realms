import { registerScript, type EffectAPI, type TargetSpec } from '../registry'
import { getCard } from '../../db'
import { effAttack, effDefence } from '../../../engine/statics'
import { validateTarget } from '../../../engine/casting'
import { occupies } from '../../../engine/grid'
import { strikeOnce } from '../multi-card-utils/strike-once'

// 'Airborne / Genesis → Teleport target weaker minion to this location.
// Clamor of Harpies may strike it.'
// The Genesis is not a "may": with a weaker minion to target, one must be chosen. The pick is still `upTo`
// at cast time (so the Harpies can be summoned when there is none), and a cast that skipped it is asked
// again once they land. Only a minion that arrives here can be struck.
const victimSpec: TargetSpec = {
  what: 'minion', count: 1, upTo: true, targeted: true, label: 'target weaker minion',
  // "weaker" = weaker than Clamor of Harpies, which isn't on the board yet at
  // validation time (the caster passed here is the summoner), so use printed power
  filter: (state, u) => {
    const d = getCard('Clamor of Harpies')
    return Math.floor((effAttack(state, u) + effDefence(state, u)) / 2) < Math.floor(((d.attack ?? 0) + (d.defence ?? 0)) / 2)
  },
}

registerScript('Clamor of Harpies', {
  genesisTargets: [victimSpec],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const t = ctx.targets[0]
    if (t && 'unit' in t) return summon(ctx, t.unit)
    const candidates = Object.values(ctx.state.units)
      .filter((u) => u.id !== self.id && !validateTarget(ctx.state, victimSpec, { unit: u.id }, self, ctx.controller))
      .map((u) => u.id)
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Clamor of Harpies — teleport which weaker minion here?', data: { candidates, count: 1, upTo: false, kind: 'unit' } }, 'summon')
  },
  conts: {
    summon: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') summon(ctx, id)
    },
    peck: (ctx, contCtx, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (choice && self && ctx.state.units[contCtx.victim]) strikeOnce(ctx, self, contCtx.victim)
    },
  },
})

/** teleport the victim to the Harpies; if it is there, they may strike it */
function summon(ctx: EffectAPI, victimId: string): void {
  const self = ctx.state.units[ctx.sourceId]
  const u = ctx.state.units[victimId]
  if (!self || !u) return
  ctx.teleport(u.id, self.x, self.y, self.region)
  const here = ctx.state.units[u.id]
  if (!here || !ctx.state.units[self.id] || !occupies(here, self.x, self.y, self.region)) return
  ctx.ask({ kind: 'yesNo', title: `Strike ${u.name}?` }, 'peck', { victim: u.id })
}
