import type { Element } from './types'

/** A site TRAP is played face-down, disguised as the basic site of its single element. Both players
 *  see that basic site's art (plus a trap badge); only the owner ever learns the real card. */
export const TRAP_DISGUISE: Record<Element, string> = {
  air: 'Spire',
  earth: 'Valley',
  fire: 'Wasteland',
  water: 'Stream',
}

/** the single element a trap's thresholds declare (a trap is one element, so one non-zero pip). */
export function trapElementOf(thresholds: { air: number; earth: number; fire: number; water: number }): Element | undefined {
  return (['air', 'earth', 'fire', 'water'] as Element[]).find((e) => (thresholds[e] ?? 0) > 0)
}
