// Carrying Units (and the artifacts everyone is carrying).
//
// Chains are legal — a War Horse carrying a War Horse carrying a minion, each
// with artifacts ("horse tower") — so every traversal here uses a visited set,
// and picking up anything that transitively carries you is refused.

import { getScript } from '../cards/scripts/registry'
import type { GameState, PlayerId, Region, UnitState } from './types'
import { pushLog } from './effects'

/** true if `carrierId` transitively carries `unitId` */
export function carriesTransitively(state: GameState, carrierId: string, unitId: string): boolean {
  const visited = new Set<string>()
  const stack = [carrierId]
  while (stack.length) {
    const cur = stack.pop()!
    if (visited.has(cur)) continue
    visited.add(cur)
    const u = state.units[cur]
    if (!u) continue
    for (const id of u.carryingUnits) {
      if (id === unitId) return true
      stack.push(id)
    }
  }
  return false
}

/**
 * Move everything a unit carries (artifacts + units, recursively) to its
 * location. Call after ANY movement of the carrier.
 */
export function syncCarried(state: GameState, carrier: UnitState, visited: Set<string> = new Set()): void {
  if (visited.has(carrier.id)) return
  visited.add(carrier.id)
  for (const artId of carrier.carrying) {
    const art = state.artifacts[artId]
    if (art) {
      art.x = carrier.x
      art.y = carrier.y
      art.region = carrier.region
    }
  }
  // A carrier dragged INTO THE VOID (Lacuna Entity, Nightmare, Into the Abyss) doesn't take its
  // ON-TOP cargo with it — those units are left behind on the surface (dropped in place, at the
  // carrier's old square, since they haven't been moved yet). Only cargo carried INSIDE the carrier
  // (a Brobdingnag Bullfrog's belly — carriedAreDisabled) rides down into the void with it.
  const carrierSwallows = !!getScript(carrier.name)?.carriedAreDisabled && !carrier.silenced
  for (const unitId of carrier.carryingUnits) {
    const u = state.units[unitId]
    if (!u) continue
    if (carrier.region === 'void' && !carrierSwallows) {
      detachFromCarrier(state, u) // stays behind on the surface — it doesn't follow into the void
      continue
    }
    // an avatar can NEVER leave the surface: a mount that burrows/submerges while carrying it drops it
    // (it stays put on the surface at the mount's square), rather than dragging it into an illegal region.
    if (u.isAvatar && carrier.region !== 'surface') {
      u.x = carrier.x
      u.y = carrier.y
      u.region = 'surface'
      detachFromCarrier(state, u)
      pushLog(state, u.controller, `${u.name} is dropped — an avatar cannot leave the surface.`)
      continue
    }
    u.x = carrier.x
    u.y = carrier.y
    u.region = carrier.region
    syncCarried(state, u, visited)
  }
}

/** the carried unit stops being carried (its own move, effect displacement...) */
export function detachFromCarrier(state: GameState, unit: UnitState): void {
  if (!unit.carriedBy) return
  const carrier = state.units[unit.carriedBy]
  if (carrier) carrier.carryingUnits = carrier.carryingUnits.filter((id) => id !== unit.id)
  unit.carriedBy = null
}

/** Send every SURFACE artifact occupying (x,y) underground — loose ones directly, and CARRIED ones too:
 *  a carried artifact whose bearer wasn't itself buried (an Avatar, or a unit that couldn't burrow) is
 *  detached from its bearer and buried on its own. (One whose bearer WAS buried already rode down via
 *  syncCarried, so its region is no longer 'surface' and it's skipped.) Used by Cave-In, Earthquake, … */
/** Sink every SURFACE artifact at a square below ground (Cave-In / Earthquake, default) or under water
 *  (Stormy Seas). A carried artifact is located by its BEARER's position — so one held by a bearer that
 *  itself can't sink (the Avatar stays up top; a non-submergeable minion stays dry) is still found,
 *  detached from that bearer, and sunk on its own. An artifact already below the surface — e.g. one
 *  riding a minion that just submerged, which syncCarried already pulled under — is skipped. */
export function buryArtifactsAt(state: GameState, x: number, y: number, toRegion: Region = 'underground'): void {
  for (const a of Object.values(state.artifacts)) {
    const bearer = a.carriedBy ? state.units[a.carriedBy] : null
    const ax = bearer ? bearer.x : a.x
    const ay = bearer ? bearer.y : a.y
    const aregion = bearer ? bearer.region : a.region
    if (ax !== x || ay !== y || aregion !== 'surface') continue
    if (bearer) { bearer.carrying = bearer.carrying.filter((id) => id !== a.id); a.carriedBy = null }
    a.x = x; a.y = y; a.region = toRegion
  }
}

/** when a carrier leaves the realm, carried units are dropped in place */
export function dropAllCarriedUnits(state: GameState, carrier: UnitState): void {
  for (const id of [...carrier.carryingUnits]) {
    const u = state.units[id]
    if (u) u.carriedBy = null
  }
  carrier.carryingUnits = []
}

export function pickUpUnits(state: GameState, player: PlayerId, carrier: UnitState, unitIds: string[]): string | null {
  const spec = getScript(carrier.name)?.carryUnits
  // some cargo invites itself onto any matching carrier (Sir Tom Thumb on Beasts)
  const invited = (u: UnitState): boolean => {
    const f = getScript(u.name)?.carriedByAnyone
    return !!f && !u.silenced && f(state, carrier)
  }
  if (!spec && !unitIds.every((id) => state.units[id] && invited(state.units[id]))) return `${carrier.name} cannot carry units.`
  const capacity = !spec || spec.capacity === 'any' ? Infinity : spec.capacity
  if (carrier.carryingUnits.length + unitIds.length > capacity) return `${carrier.name} cannot carry that many units.`
  for (const id of unitIds) {
    const u = state.units[id]
    if (!u) return 'No such unit.'
    if (u.id === carrier.id) return 'A unit cannot carry itself.'
    // avatars can only be carried by "may carry an ally" carriers (Fine Courser,
    // War Horse). "Allied MINION" carriers (Beast of Burden, Stagecoach…) can't.
    if (u.isAvatar && !(spec?.allowAvatar || invited(u))) return 'Avatars cannot be carried by that.'
    if (u.carriedBy) return `${u.name} is already being carried.`
    if (u.x !== carrier.x || u.y !== carrier.y || u.region !== carrier.region) return `${u.name} is not at this location.`
    if (carriesTransitively(state, u.id, carrier.id)) return 'That would create a carrying loop.'
    if (!invited(u) && spec?.filter && !spec.filter(state, carrier, u)) return `${carrier.name} cannot carry ${u.name}.`
  }
  for (const id of unitIds) {
    const u = state.units[id]!
    u.carriedBy = carrier.id
    carrier.carryingUnits.push(id)
    pushLog(state, player, `${carrier.name} picks up ${u.name}.`)
  }
  return null
}

export function dropUnits(state: GameState, player: PlayerId, carrier: UnitState, unitIds: string[]): string | null {
  // some carriers can't set their cargo down at will (Brobdingnag Bullfrog's belly:
  // the meal is only freed when the Bullfrog leaves the realm)
  if (getScript(carrier.name)?.carriedCantDrop && !carrier.silenced) return `${carrier.name} can't release what it carries.`
  for (const id of unitIds) {
    if (!carrier.carryingUnits.includes(id)) return 'Not carrying that unit.'
  }
  for (const id of unitIds) {
    const u = state.units[id]
    if (u) u.carriedBy = null
    carrier.carryingUnits = carrier.carryingUnits.filter((x) => x !== id)
    pushLog(state, player, `${carrier.name} sets ${u?.name ?? 'a unit'} down.`)
  }
  return null
}
