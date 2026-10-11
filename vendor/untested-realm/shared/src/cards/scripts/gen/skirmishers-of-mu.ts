import { registerScript } from '../registry'
import { shootProjectile, type Direction } from '../../../engine/combat'

// 'Ranged / During basic movement, Skirmishers of Mu may perform a ranged
//  strike from any location along their path.'
//
// The player picks WHICH square along the march to shoot from (including the starting square) and the
// direction — and it only happens if the Skirmishers actually reach that square. Because movement is
// synchronous and the choice prompt resolves only AFTER the whole move finishes, we accumulate the
// squares actually travelled during the move and offer them all at the end. The shot itself is a REAL
// ranged strike (shootProjectile) so it's a strike (Grim Guisarme doubles it), fires afterRangedStrike /
// onKill, respects Lethal, blockers and the Magellan wrap — not a bespoke damage poke.
registerScript('Skirmishers of Mu', {
  onUnitEntersSquare: (ctx, moved, from, via, final) => {
    if (moved.id !== ctx.sourceId) return
    // "During BASIC movement" — only the Skirmishers' own Move / Move-and-Attack action, NOT a
    // forced relocation (blown by Wuthering Heights, teleported, pulled) and not the summon entry.
    if (via !== 'move') return
    if (!from || from.region === ('offboard' as any) || from.x < 0) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.counters?.volleyTurn === ctx.state.turn) return
    // accumulate the squares actually ENTERED this march (the start, then each square landed on). self
    // here sits on the square just entered — movement is synchronous, so this records the true route;
    // if the unit is killed / halted mid-move, only the squares it really reached are remembered.
    // (counters are number-only, so the path rides on flow, keyed by unit id.)
    const flow = (ctx.state.flow = ctx.state.flow ?? {})
    const paths: Record<string, { x: number; y: number }[]> = (flow.volleyPaths = flow.volleyPaths ?? {})
    const prior = paths[self.id] ?? []
    const path = prior.length ? [...prior] : [{ x: from.x, y: from.y }]
    path.push({ x: self.x, y: self.y })
    paths[self.id] = path
    if (!final) return
    // the march has ended — offer ONE volley from any square actually travelled (incl. the start).
    // Claim the once-per-turn flag BEFORE the prompt (a parallel re-entry can't then double-offer it).
    self.counters = { ...self.counters, volleyTurn: ctx.state.turn }
    delete paths[self.id]
    const seen = new Set<string>()
    const origins = path.filter((s) => { const k = `${s.x},${s.y}`; if (seen.has(k)) return false; seen.add(k); return true })
    ctx.ask({ kind: 'chooseSquare', title: 'Skirmishers — shoot from which square on your march? (then Hold fire to skip)', data: { squares: origins } }, 'volleyOrigin')
  },
  conts: {
    volleyOrigin: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq || typeof sq.x !== 'number') return
      ctx.ask({ kind: 'chooseOption', title: `Skirmishers — fire which way from ${sq.x},${sq.y}?`, data: { options: ['n', 's', 'e', 'w', 'hold fire'] } }, 'volleyDir', { ox: sq.x, oy: sq.y })
    },
    volleyDir: (ctx, c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof dir !== 'string' || dir === 'hold fire') return
      // a REAL ranged strike from the chosen square — it already tapped to move, so skip the tap gate.
      shootProjectile(ctx.state, ctx.controller, self.id, dir as Direction, { x: c.ox as number, y: c.oy as number }, { skipTapCheck: true })
    },
  },
})
