import { registerScript, type EffectAPI } from '../registry'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Each minion deals 1 damage to its site, destroys an artifact there, then
//  taps. They don't untap the next time they would.'
registerScript('Blasphemy', {
  onCast: (ctx) => {
    // damage + tap hit every surface minion (no choices here)
    for (const u of Object.values(ctx.state.units)) {
      if (u.isAvatar || u.region !== 'surface') continue
      const site = siteAt(ctx.state, u.x, u.y)
      if (site) ctx.dealDamage({ site: site.id }, 1)
      u.tapped = true
      u.counters = { ...u.counters, skipUntap: 1 }
    }
    pushLog(ctx.state, ctx.controller, 'A wave of blasphemy sweeps the realm — all fall to their knees.')
    checkStateBased(ctx.state)
    // "destroys an artifact there" — resolve per minion (may prompt)
    blasphemyDestroy(ctx, Object.values(ctx.state.units).filter((u) => !u.isAvatar && u.region === 'surface').map((u) => u.id))
  },
  conts: {
    blasphemyPick: (ctx, c: any, choice: any) => {
      const artId = Array.isArray(choice) ? choice[0] : choice
      if (artId && ctx.state.artifacts[artId]) ctx.breakArtifact(artId)
      blasphemyDestroy(ctx, c.queue as string[])
    },
  },
})

// Resolve Blasphemy's per-minion artifact destruction. Each minion destroys ONE
// uncarried artifact on its square; the minion's controller chooses which — but only
// when the square has more artifacts than minions still to act there (otherwise every
// artifact dies regardless, so we skip the prompt).
function blasphemyDestroy(ctx: EffectAPI, queue: string[]): void {
  while (queue.length) {
    const uid = queue.shift()!
    const u = ctx.state.units[uid]
    if (!u || u.region !== 'surface') continue
    const arts = Object.values(ctx.state.artifacts).filter((a) => !a.carriedBy && a.x === u.x && a.y === u.y && a.region === 'surface')
    if (arts.length === 0) continue
    if (arts.length === 1) { ctx.breakArtifact(arts[0].id); continue }
    const minionsLeftHere = 1 + queue.filter((qid) => {
      const q = ctx.state.units[qid]
      return q && q.region === 'surface' && q.x === u.x && q.y === u.y
    }).length
    if (minionsLeftHere >= arts.length) { ctx.breakArtifact(arts[0].id); continue } // all will die → no meaningful choice
    ctx.ask({ kind: 'chooseTargets', title: 'Blasphemy — destroy which artifact?', data: { candidates: arts.map((a) => a.id), count: 1, kind: 'artifact' }, player: u.controller }, 'blasphemyPick', { queue })
    return // resume in blasphemyPick after this minion's choice
  }
  checkStateBased(ctx.state)
}
