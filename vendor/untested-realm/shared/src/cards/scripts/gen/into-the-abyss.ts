import { registerScript, type EffectAPI } from '../registry'
import { checkStateBased, emitUnitMoved, pushLog, trySubmerge } from '../../../engine/effects'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'
import type { UnitState } from '../../../engine/types'

/** the voids (siteless squares) bordering the minion's location — "a void it's adjacent to" */
const adjacentVoids = (ctx: EffectAPI, u: UnitState) =>
  adjacentSquaresW(ctx.state, u.x, u.y).filter((s) => !siteAt(ctx.state, s.x, s.y) && !(s.x === u.x && s.y === u.y))

// "Submerge target minion, or pull it into a void it's adjacent to."
registerScript('Into the Abyss', {
  targets: [{ what: 'minion', count: 1, targeted: true, label: 'target minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    // to "submerge" is to go from the surface to underwater of a water site (Codex, Submerge)
    const canSubmerge = u.region === 'surface' && terrainAt(ctx.state, u.x, u.y) === 'water'
    const canPull = adjacentVoids(ctx, u).length > 0
    const options = [...(canSubmerge ? ['submerge it'] : []), ...(canPull ? ['pull into the void'] : [])]
    if (!options.length) return ctx.log('No abyss to send it to.')
    ctx.ask({ kind: 'chooseOption', title: 'Into the Abyss:', data: { options } }, 'abyss', { unitId: u.id })
  },
  conts: {
    abyss: (ctx, contCtx, choice) => {
      const u = ctx.state.units[contCtx.unitId]
      if (!u) return
      if (choice === 'submerge it') {
        // a forced submerge (trySubmerge): "can't be moved by force", an Anchorman, the Cage of Sidrak,
        // Driftwood Marrows and a land-straddling oversized body all stop it; what it carries goes under
        // with it, and a minion that can't live underwater drowns.
        const from = { x: u.x, y: u.y, region: u.region }
        if (!trySubmerge(ctx.state, u, ctx.controller)) return
        const sunk = ctx.state.units[u.id]
        if (!sunk) return // drowned
        emitUnitMoved(ctx.state, sunk, from)
        pushLog(ctx.state, ctx.controller, `${sunk.name} is dragged into the depths!`)
        checkStateBased(ctx.state)
        return
      }
      if (choice !== 'pull into the void') return
      // which void is the caster's choice
      const squares = adjacentVoids(ctx, u)
      if (squares.length === 1) return pullInto(ctx, u, squares[0])
      if (squares.length) ctx.ask({ kind: 'chooseSquare', title: `Into the Abyss: pull ${u.name} into which void?`, data: { squares } }, 'void', { unitId: u.id })
    },
    void: (ctx, contCtx, sq) => {
      const u = ctx.state.units[contCtx.unitId]
      if (!u || !sq || typeof sq.x !== 'number' || typeof sq.y !== 'number') return
      const v = adjacentVoids(ctx, u).find((s) => s.x === sq.x && s.y === sq.y)
      if (v) pullInto(ctx, u, v)
    },
  },
})

/** a forced PULL into the void — the card's deliberate exception (intoVoid, FAQ: "Yes, obviously!"), still
 *  Cage / push-ban / move-protection aware; a minion without Voidwalk is then banished there */
function pullInto(ctx: EffectAPI, u: UnitState, v: { x: number; y: number }): void {
  ctx.teleport(u.id, v.x, v.y, 'void', { push: true, intoVoid: true })
}
