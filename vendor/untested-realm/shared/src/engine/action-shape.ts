import type { Action } from './types'

// Structural check of a raw Action before the engine touches it. The typed client always sends well-formed
// actions, but the engine is embedded by other sites and fed from the network: a `path: false`, a number
// among `targets` or `attack: "x"` used to THROW deep inside the engine (fuzz_raw) instead of being refused.
// Only shapes are checked here; every rule stays in the action's own handler.

const REGIONS = ['surface', 'underground', 'underwater', 'void']
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrArr = (v: unknown) => Array.isArray(v) && v.every(isStr)
const isInt = (v: unknown) => Number.isInteger(v)
/** a board location: integer x/y and, when given, a real region */
export const isLocation = (v: unknown) =>
  isObj(v) && isInt(v.x) && isInt(v.y) && (v.region === undefined || REGIONS.includes(v.region as string))
const optional = (v: unknown, ok: (v: unknown) => boolean) => v === undefined || v === null || ok(v)

export function actionShapeProblem(action: unknown): string | null {
  if (!isObj(action) || !isStr(action.t)) return 'Malformed action.'
  const a = action as Record<string, unknown>
  const bad = (field: string) => `Malformed action: ${field}.`
  switch ((action as Action).t) {
    case 'mulligan':
      return isStrArr(a.back) ? null : bad('back')
    case 'drawChoice':
      return a.deck === 'spellbook' || a.deck === 'atlas' ? null : bad('deck')
    case 'avatarSite':
      if (a.mode === 'draw') return null
      if (a.mode !== 'play') return bad('mode')
      return isStr(a.cardId) && isInt(a.x) && isInt(a.y) ? null : bad('cardId/x/y')
    case 'castSpell':
      if (!isStr(a.cardId) || !optional(a.casterId, isStr)) return bad('cardId/casterId')
      if (!optional(a.targets, isStrArr)) return bad('targets')
      if (!optional(a.at, isLocation)) return bad('at')
      return optional(a.extra, isObj) ? null : bad('extra')
    case 'moveAttack':
      if (!isStr(a.unitId)) return bad('unitId')
      if (!Array.isArray(a.path) || !a.path.every(isLocation)) return bad('path')
      return optional(a.attack, (t) => isObj(t) && (isStr(t.unit) || isStr(t.site))) ? null : bad('attack')
    case 'activate':
      if (!isStr(a.sourceId) || !isStr(a.ability)) return bad('sourceId/ability')
      if (!optional(a.targets, isStrArr)) return bad('targets')
      if (!optional(a.at, isLocation)) return bad('at')
      return optional(a.extra, isObj) ? null : bad('extra')
    case 'pickUp':
    case 'drop':
      if (!isStr(a.unitId)) return bad('unitId')
      return isStrArr(a.artifactIds) && optional(a.unitIds, isStrArr) ? null : bad('artifactIds/unitIds')
    case 'prompt':
      return isStr(a.promptId) ? null : bad('promptId')
    case 'addTime':
      return (a.player === 0 || a.player === 1) && Number.isFinite(a.ms) ? null : bad('player/ms')
    case 'judge':
      return isObj(a.op) && isStr(a.op.k) ? null : bad('op')
    case 'keepHand':
    case 'endTurn':
    case 'concede':
    case 'requestInterject':
    case 'endInterject':
      return null
    default:
      return 'Unknown action.'
  }
}
