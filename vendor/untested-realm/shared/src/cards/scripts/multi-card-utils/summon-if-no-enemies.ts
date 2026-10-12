import { siteAt, unitsAt } from '../../../engine/grid'
import type { GameState, PlayerId } from '../../../engine/types'

// 'May be cast to any site without enemies.' (Saracen Raiders / Saracen Scout)
// This ADDS casting locations — it never removes any. On top of the normal rule (a minion is summoned
// atop YOUR own sites), the Saracens may ALSO be cast to any OTHER site that holds no enemy of yours.
// So your own sites stay fully legal (even one an enemy stands on, exactly like any normal minion);
// only the EXTRA, non-controlled sites are gated on being enemy-free. (summonAnywhere waives the
// your-site requirement; this filter then re-permits your sites and enemy-free foreign ones.)
export const summonIfNoEnemies = (state: GameState, player: PlayerId, at: { x: number; y: number }) => {
  const site = siteAt(state, at.x, at.y)
  if (site && site.controller === player) return null // your own site — a normal summon location
  return unitsAt(state, at.x, at.y).some((u) => u.controller !== player) ? 'That site holds enemies.' : null
}
