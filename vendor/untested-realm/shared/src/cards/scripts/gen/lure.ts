import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { selfStepsCloser } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'

// 'An ally tempts an enemy minion at a nearby site into taking a step closer.'
registerScript('Lure', {
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'the tempting ally' },
    { what: 'minion', count: 1, targeted: false, owner: 'enemy', label: 'an enemy minion at a nearby site' },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!('unit' in t1) || !('unit' in t2)) return
    const bait = ctx.state.units[t1.unit]
    const fish = ctx.state.units[t2.unit]
    if (!bait || !fish) return
    if (!nearbySquaresW(ctx.state, bait.x, bait.y).some((s) => s.x === fish.x && s.y === fish.y)) return ctx.log('Not nearby.')
    const options = selfStepsCloser(ctx.state, fish, bait) // "take a step closer" (def. 2)
    if (options.length === 0) return
    if (options.length === 1) { ctx.teleport(fish.id, options[0].x, options[0].y, fish.region); checkStateBased(ctx.state); return }
    // AGENCY RULE (see Coy Nixie): several legal closer steps → the EFFECT's
    // controller chooses which (unless the card says otherwise); forced move, must pick one.
    ctx.ask({ kind: 'chooseSquare', title: `Lure — step ${fish.name} closer (choose a direction)`, data: { squares: options.map((s) => ({ x: s.x, y: s.y })) }, player: ctx.controller }, 'lureStep', { victim: fish.id })
  },
  conts: {
    lureStep: (ctx, c: any, choice: any) => {
      const u = ctx.state.units[c.victim as string]
      if (!u || !choice || typeof choice.x !== 'number') return
      ctx.teleport(u.id, choice.x, choice.y, u.region)
      checkStateBased(ctx.state)
    },
  },
})
