import { GRID_H, realmIsFlat } from '../../../engine/grid'
import { effKeywords, terrainAt } from '../../../engine/statics'
import type { GameState, Region, Step, UnitState } from '../../../engine/types'
import type { ParsedKeywords } from '../../db'

/** The orthogonal steps `unit` may take from `from` onto the square (wx,wy) across a joined edge. A square
 *  across the edge is adjacent like any other, so every kind of step works across it: a surface step onto a
 *  site, a Voidwalk step into (or out of) the void, an underground/underwater step between subsurfaces.
 *  These are extra-step grants, which skip isLegalStep's geometry — so each one is checked here.
 *  (Magellan Globe; the top/bottom wraps of Polar Bears, Polar Explorers, Ruler of Thul.) */
export function wrapStepsTo(state: GameState, unit: UnitState, from: Step, wx: number, wy: number, kw: ParsedKeywords = effKeywords(state, unit)): Step[] {
  const voidwalk = !!kw.voidwalk && !unit.isAvatar
  const t = terrainAt(state, wx, wy)
  const out: Step[] = []
  const to = (region: Region) => out.push({ x: wx, y: wy, region })
  if (t === 'void') {
    if (voidwalk) to('void') // into the void from any region, or along it
    return out
  }
  if (from.region === 'surface' || (from.region === 'void' && voidwalk)) to('surface')
  if (t === 'land' && kw.burrowing && (from.region === 'underground' || (from.region === 'void' && voidwalk))) to('underground')
  if (t === 'water' && kw.submerge && (from.region === 'underwater' || (from.region === 'void' && voidwalk))) to('underwater')
  return out
}

/** "can move as if the top and bottom edges of the realm were connected": the step from the top row to the
 *  bottom row of the same column (or back), of whatever kind the unit could take between neighbours. None
 *  while the realm is flat (Flat Realm Society). */
export function topBottomWrapStepsFor(state: GameState, unit: UnitState, from: Step): Step[] {
  if ((from.y !== 0 && from.y !== GRID_H - 1) || realmIsFlat(state)) return []
  return wrapStepsTo(state, unit, from, from.x, from.y === 0 ? GRID_H - 1 : 0)
}
