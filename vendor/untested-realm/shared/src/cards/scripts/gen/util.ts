import { bodyOfWater } from '../multi-card-utils/body-of-water'
import type { GameState } from '../../../engine/types'

/** contiguous body of water containing (x,y), as a set of "x,y" keys. Magellan-aware.
 *  Thin alias over the shared bodyOfWater so every "body of water" reading wraps the seam identically. */
export function bodyOfWaterAt(state: GameState, x: number, y: number): Set<string> {
  return bodyOfWater(state, x, y)
}
