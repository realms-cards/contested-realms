import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, trySubmerge } from '../../../engine/effects'

// 'Permanently flood the entire realm, including voids. Submerge everything
//  except one minion of each type.' — for each minion type, its controller
//  keeps one above water (agency: each owner picks their survivor per type).
registerScript('The Flood', {
  // The realm stays flooded forever (Great Old One): a persistent flow flag lets The
  // Flood keep flooding rubble and any site that enters the realm later, from the cemetery.
  listensFromCemetery: true,
  onSitePlayed: (ctx, _by, site) => {
    if (!ctx.state.flow?.realmFlooded) return
    const s = ctx.state.sites[site.id]
    if (s) s.flooded = true
  },
  onCast: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.realmFlooded = true
    // the whole realm drowns — rubble included (rubble can hold water)
    for (const s of Object.values(ctx.state.sites)) s.flooded = true
    pushLog(ctx.state, null, 'The rains come — and do not stop. The realm drowns.')
    // group surviving-candidate minions by subtype
    const types = new Set<string>()
    for (const u of Object.values(ctx.state.units)) {
      if (u.isAvatar || u.region !== 'surface') continue
      for (const st of getCard(u.name).subtypes) types.add(st)
    }
    floodNext(ctx, [...types].sort(), [])
  },
  conts: {
    ark: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const spared = c.spared as string[]
      if (typeof id === 'string' && ctx.state.units[id]) spared.push(id)
      floodNext(ctx, c.rest as string[], spared)
    },
  },
})

// Save ONE minion per type — but a multi-type minion counts as ALL its types (FAQ):
// sparing a Wyvern (Beast + Dragon) uses up BOTH Beast and Dragon, so you can't also
// save a Bonekite (Dragon). We walk the types in order and, for each type not already
// "used up" by an earlier pick, let the controller spare one minion of it.
function floodNext(ctx: any, types: string[], spared: string[]): void {
  // types whose slot is already consumed by an already-spared minion
  const usedTypes = new Set<string>()
  for (const id of spared) {
    const u = ctx.state.units[id]
    if (u) for (const st of getCard(u.name).subtypes) usedTypes.add(st)
  }
  let type: string | undefined
  let rest = types
  while (rest.length) {
    ;[type, ...rest] = rest
    if (type && !usedTypes.has(type)) break
    type = undefined
  }
  if (!type) {
    // everything else on the surface goes under
    for (const u of Object.values(ctx.state.units) as any[]) {
      if (u.isAvatar || u.region !== 'surface' || spared.includes(u.id)) continue
      trySubmerge(ctx.state, u)
    }
    return
  }
  // a candidate is any surviving minion of THIS type that doesn't ALSO carry an already-used
  // type (a Dragon+Undead Bonekite can't be saved once another Dragon was saved — FAQ:
  // "you can only save one Dragon", and a minion is all of its types at once).
  const candidates = (Object.values(ctx.state.units) as any[])
    .filter((u) => !u.isAvatar && u.region === 'surface' && !spared.includes(u.id)
      && getCard(u.name).subtypes.includes(type as string)
      && !getCard(u.name).subtypes.some((st: string) => st !== type && usedTypes.has(st)))
    .map((u) => u.id)
  if (!candidates.length) return floodNext(ctx, rest, spared)
  if (candidates.length === 1) {
    spared.push(candidates[0])
    return floodNext(ctx, rest, spared)
  }
  ctx.ask(
    { kind: 'chooseTargets', title: `The Flood: which ${type} is spared?`, data: { candidates, count: 1, upTo: false, kind: 'unit' } },
    'ark',
    { rest, spared },
  )
}
