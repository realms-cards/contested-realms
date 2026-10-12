import { registerScript, type EffectAPI } from '../registry'
import { orthAdjacentWrapped, siteAt, unitsAt } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'
import { isDyingUnit } from '../../../engine/effects'
import type { UnitState } from '../../../engine/types'

// is `u` still standing on this Sold-out Cemetery site? (ctx.sourceId is the site)
function stillHere(ctx: EffectAPI, u: UnitState): boolean {
  const self = ctx.state.sites[ctx.sourceId]
  return !!self && u.x === self.x && u.y === self.y
}

// 'Whenever Undead enter this site, push another Undead here away one step.'
registerScript('Sold-out Cemetery', {
  onUnitEntersSquare: (ctx, moved) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || moved.isAvatar || moved.x !== self.x || moved.y !== self.y) return
    if (!effSubtypes(ctx.state, moved).includes('Undead')) return
    // NB: there is NO once-per-turn limit. Two adjacent Sold-out Cemeteries may legally shuffle an Undead
    // back and forth as many times as the player keeps choosing to (each push is its own direction prompt)
    // — you just burn your clock; nothing forbids it. So we do NOT cap re-eviction.
    // Skip Undead that are already DOOMED but still on the board — their death is merely deferred
    // (parked behind a prompt in flow.pendingDeaths, OR lethally damaged inside an open damage event /
    // combat batch that hasn't settled yet). A card that kills an Undead here THEN summons another onto
    // this site (Fowl Bones' raise, or any damage-then-summon) fires this trigger while the doomed
    // Undead is still present; offering it as the only MANDATORY push candidate soft-locks once it
    // vanishes. isDyingUnit covers BOTH deferral routes.
    const others = unitsAt(ctx.state, self.x, self.y)
      .filter((u) => u.id !== moved.id && !u.isAvatar && !isDyingUnit(ctx.state, u) && effSubtypes(ctx.state, u).includes('Undead'))
      .map((u) => u.id)
    if (!others.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'No vacancy — which Undead is pushed out?', data: { candidates: others, count: 1, upTo: false, kind: 'unit' } }, 'evict')
  },
  conts: {
    evict: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      // A single continuous move that enters the site more than once (revisit / loop) queues one
      // eviction PER entry, all capturing the SAME resident Undead before any resolves — so the same
      // creature used to be pushed (and prompted for its direction) twice. Guard both ways: (a) it must
      // still BE on the site (a prior eviction may already have shoved it off — auto-push case), and
      // (b) an eviction of it must not already be in flight (its direction prompt still pending).
      if (!u || !stillHere(ctx, u)) return
      if (ctx.state.prompts.some((p) => p.cont === 'script:Sold-out Cemetery:shamble' && (p.ctx as any)?.unitId === u.id)) return
      const steps = orthAdjacentWrapped(ctx.state, u.x, u.y).filter((s) => siteAt(ctx.state, s.x, s.y))
      if (!steps.length) return
      if (steps.length === 1) return ctx.teleport(u.id, steps[0].x, steps[0].y, u.region, { push: true }) // "push away one step"
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} shambles out — which way?`, data: { squares: steps }, player: u.controller }, 'shamble', { unitId: u.id })
    },
    shamble: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq && stillHere(ctx, u)) ctx.teleport(u.id, sq.x, sq.y, u.region, { push: true }) // "push away one step" (skip if already evicted)
    },
  },
})
