import { registerScript, type EffectAPI } from '../registry'
import { pushLog, checkStateBased, tapUnit } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Each minion deals 1 damage to its site, destroys an artifact there, then
//  taps. They don't untap the next time they would.'
registerScript('Blasphemy', {
  onCast: (ctx) => {
    // damage + tap hit EVERY minion, below the surface too (no choices here); a minion in the void has no site
    for (const u of Object.values(ctx.state.units)) {
      if (u.isAvatar) continue
      const site = u.region === 'void' ? undefined : siteAt(ctx.state, u.x, u.y)
      if (site) ctx.dealDamage({ site: site.id }, 1)
      tapUnit(ctx.state, u)
      u.counters = { ...u.counters, skipUntap: 1 }
    }
    pushLog(ctx.state, ctx.controller, 'A wave of blasphemy sweeps the realm — all fall to their knees.')
    checkStateBased(ctx.state)
    // "destroys an artifact there" — resolve per minion (may prompt)
    blasphemyDestroy(ctx, Object.values(ctx.state.units).filter((u) => !u.isAvatar).map((u) => u.id))
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
// artifact at its location — lying there or carried by a unit there (a carried artifact
// shares its bearer's location, Codex Carrying); the minion's controller chooses which — but only
// when the square has more artifacts than minions still to act there (otherwise every
// artifact dies regardless, so we skip the prompt).
function blasphemyDestroy(ctx: EffectAPI, queue: string[]): void {
  while (queue.length) {
    const uid = queue.shift()!
    const u = ctx.state.units[uid]
    if (!u) continue
    const sameLoc = (o: { x: number; y: number; region: string }) => o.x === u.x && o.y === u.y && o.region === u.region
    const arts = Object.values(ctx.state.artifacts).filter((a) => {
      if (!a.carriedBy) return sameLoc(a)
      const bearer = ctx.state.units[a.carriedBy]
      return !!bearer && sameLoc(bearer)
    })
    if (arts.length === 0) continue
    if (arts.length === 1) { ctx.breakArtifact(arts[0].id); continue }
    const minionsLeftHere = 1 + queue.filter((qid) => {
      const q = ctx.state.units[qid]
      return q && sameLoc(q)
    }).length
    if (minionsLeftHere >= arts.length) { ctx.breakArtifact(arts[0].id); continue } // all will die → no meaningful choice
    ctx.ask({ kind: 'chooseTargets', title: 'Blasphemy — destroy which artifact?', data: { candidates: arts.map((a) => a.id), count: 1, kind: 'artifact' }, player: u.controller }, 'blasphemyPick', { queue })
    return // resume in blasphemyPick after this minion's choice
  }
  checkStateBased(ctx.state)
}
