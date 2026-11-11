import type { EffectAPI } from '../registry'
import { checkWard, killUnit, pushLog } from '../../../engine/effects'

/** "Destroy all …" (Aria Wraith, Apply Alkahest, Boil, Unravel, Rite of Eruption): everything chosen is
 *  destroyed at once. Every ward is judged first (a warded minion's ward breaks instead — rulebook Ward),
 *  then the doomed artifacts break and the doomed minions die. So nothing one casualty's Deathrite does
 *  (granting a ward, say) changes whether another of them is destroyed. Avatars are never destroyed. */
export function destroyTogether(ctx: EffectAPI, unitIds: Iterable<string>, artifactIds: Iterable<string> = []): void {
  const doomed: string[] = []
  for (const id of new Set(unitIds)) {
    const u = ctx.state.units[id]
    if (!u || u.isAvatar) continue
    if (checkWard(ctx.state, u, ctx.controller, u.controller, 'destroy')) {
      pushLog(ctx.state, ctx.controller, `${u.name}'s ward breaks.`)
      continue
    }
    doomed.push(id)
  }
  for (const id of new Set(artifactIds)) if (ctx.state.artifacts[id]) ctx.breakArtifact(id)
  for (const id of doomed) if (ctx.state.units[id]) killUnit(ctx.state, id)
}
