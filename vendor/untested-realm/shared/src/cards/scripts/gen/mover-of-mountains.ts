import { registerScript } from '../registry'
import { nearbySquaresW, isSiteEmpty } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Spellcaster / Once on your turn, you may swap two nearby empty sites.'
registerScript('Mover of Mountains', {
  abilities: [{
    key: 'heave',
    label: 'Swap two nearby empty sites',
    cost: {},
    oncePerTurn: true,
    // Mover of Mountains is a Minion (unit-sourced), so where:'nearby' already
    // anchors on the Mover. The in-effect nearby + empty checks stay too.
    targets: [
      { what: 'site', count: 1, targeted: false, where: 'nearby', label: 'first empty site' },
      { what: 'site', count: 1, targeted: false, where: 'nearby', label: 'second empty site' },
    ],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const [t1, t2] = ctx.targets
      if (!self || !('site' in t1) || !('site' in t2)) return
      const a = ctx.state.sites[t1.site]
      const b = ctx.state.sites[t2.site]
      if (!a || !b || a.id === b.id) return
      const near = (s: { x: number; y: number }) => nearbySquaresW(ctx.state, self.x, self.y).some((q) => q.x === s.x && q.y === s.y)
      if (!near(a) || !near(b)) return ctx.log('Both sites must be nearby.')
      // "empty sites" — nothing on them: no units (any region, incl. a face-down card), artifacts or auras
      if (!isSiteEmpty(ctx.state, a.x, a.y) || !isSiteEmpty(ctx.state, b.x, b.y)) return ctx.log('Both sites must be empty.')
      const ax = a.x, ay = a.y
      a.x = b.x; a.y = b.y
      b.x = ax; b.y = ay
      pushLog(ctx.state, ctx.controller, `${a.name} and ${b.name} trade places!`)
    },
  }],
})
