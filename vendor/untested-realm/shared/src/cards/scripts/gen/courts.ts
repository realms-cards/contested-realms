// Retained courts module: card families registered via loops + helpers shared across the split cards.
import type { GameState } from '../../../engine/types'

/** A Court's static is off while an Overflowing Court has disabled the OTHER Courts
 *  (until the disabler's controller's next turn). The disabling Court itself stays on. */
export function courtActive(state: GameState, siteId: string): boolean {
  for (const d of (state.flow?.courtDisables ?? []) as { sourceId: string }[]) {
    if (d.sourceId !== siteId) return false
  }
  return true
}
