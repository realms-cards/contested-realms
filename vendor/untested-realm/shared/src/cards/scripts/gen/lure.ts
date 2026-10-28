import { registerScript } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { selfStepsCloser, takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'

// 'An ally tempts an enemy minion at a nearby site into taking a step closer.'
// Codex (Phrases that are Synonymous): "'Lure' requires the unit to take the step themselves" — its own
// step (step definition 2), not forced movement: an Immobile minion stays, "can't be moved by force"
// doesn't stop it, and it may step the way its abilities allow (Airborne diagonally).
registerScript('Lure', {
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'the tempting ally' },
    // "nearby" measured from the ally picked first, not the caster; "at a site", not in the void
    {
      what: 'minion', count: 1, targeted: false, owner: 'enemy', where: 'nearby', whereOf: 0,
      filter: (state, u) => !!siteAt(state, u.x, u.y) && u.region !== 'void',
      label: 'an enemy minion at a site nearby that ally',
    },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!t1 || !t2 || !('unit' in t1) || !('unit' in t2)) return
    const bait = ctx.state.units[t1.unit]
    const fish = ctx.state.units[t2.unit]
    if (!bait || !fish) return
    if (!nearbySquaresW(ctx.state, bait.x, bait.y).some((s) => s.x === fish.x && s.y === fish.y)) return ctx.log('Not nearby.')
    const options = selfStepsCloser(ctx.state, fish, bait)
    if (options.length === 0) return ctx.log(`${fish.name} can't step any closer.`)
    if (options.length === 1) { takeOwnStep(ctx.state, fish, options[0], ctx.controller); checkStateBased(ctx.state); return }
    // AGENCY RULE (see Coy Nixie): several legal closer steps → the EFFECT's controller chooses which
    // (unless the card says otherwise); the lure must be followed, so one is picked.
    ctx.ask({ kind: 'chooseSquare', title: `Lure — step ${fish.name} closer (choose a direction)`, data: { squares: options.map((s) => ({ x: s.x, y: s.y })) }, player: ctx.controller }, 'lureStep', { victim: fish.id, bait: bait.id })
  },
  conts: {
    lureStep: (ctx, c: any, choice: any) => {
      const u = ctx.state.units[c.victim as string]
      const bait = ctx.state.units[c.bait as string]
      if (!u || !bait || !choice || typeof choice.x !== 'number') return
      // re-derived now: the board may have changed while the question waited
      const step = selfStepsCloser(ctx.state, u, bait).find((s) => s.x === choice.x && s.y === choice.y)
      if (step) takeOwnStep(ctx.state, u, step, ctx.controller)
      checkStateBased(ctx.state)
    },
  },
})
