import { registerScript } from '../registry'
import { orthAdjacentWrapped, unitsAt } from '../../../engine/grid'

// 'Genesis & Deathrite → Kill target adjacent enemy minion.'
registerScript('Sir Mordred', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'adjacent', owner: 'enemy', label: 'target adjacent enemy minion',
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.kill(t.unit)
  },
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // "adjacent" = the source's OWN square + the orthogonal neighbours (rulebook), region-locked
    const prey = [{ x: self.x, y: self.y }, ...orthAdjacentWrapped(ctx.state, self.x, self.y)].flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region)).filter((u) => !u.isAvatar && u.controller !== ctx.controller).map((u) => u.id)
    if (!prey.length) return
    ctx.ask({ kind: 'chooseTargets', title: "Mordred's dying treachery kills whom?", data: { candidates: prey, count: 1, upTo: true, kind: 'unit' } }, 'treachery')
  },
  conts: {
    treachery: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && ctx.state.units[id]) ctx.kill(id)
    },
  },
})
