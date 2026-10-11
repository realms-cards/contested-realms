import { registerScript } from '../registry'
import { pushLog, newId, destroySite } from '../../../engine/effects'
import { unitsAt, occupies } from '../../../engine/grid'
import { beginAttack } from '../../../engine/combat'
import type { GameState, UnitState } from '../../../engine/types'

// --------------------------------------------------------------- Free City ----
// 'Once per turn, may attack or defend against enemy units here.' (3/3)
function freeCityPseudo(state: GameState, siteId: string): UnitState | null {
  const site = state.sites[siteId]
  if (!site || site.controller === null) return null
  const existing = Object.values(state.units).find((u) => u.cardId === site.cardId && u.name === 'Free City')
  if (existing) return existing
  const unitId = newId(state, 'u')
  const unit: UnitState = {
    id: unitId, cardId: site.cardId, name: 'Free City', owner: site.owner, controller: site.controller,
    isAvatar: false, x: site.x, y: site.y, region: 'surface', tapped: false, damage: 0,
    enteredTurn: state.turn - 1, // the city was always here — no summoning sickness
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  state.units[unitId] = unit
  return unit
}

registerScript('Free City', {
  damageBecomesLifeLoss: true, // FAQ: strikes cost its controller life; it never dies of wounds
  abilities: [{
    key: 'fc:attack',
    label: 'The city attacks an enemy unit here',
    cost: {},
    effect: (ctx) => {
      const site = ctx.state.sites[ctx.sourceId]
      if (!site) return
      if (ctx.state.flow?.freeCityUsed?.[site.id] === ctx.state.turn) return ctx.log('Free City already fought this turn.')
      const pseudoNow = Object.values(ctx.state.units).find((u) => u.cardId === site.cardId && u.name === 'Free City')
      if (pseudoNow?.tapped) return ctx.log('Free City already fought this turn.')
      // "attack … enemy units here" — a site's "here" spans its subsurface, and the city can reach DOWN
      // to strike a burrowed/submerged enemy beneath it (no region filter). (Defending, below, stays
      // surface-only — the city walls only shield allies standing atop it.)
      const enemies = unitsAt(ctx.state, site.x, site.y)
        .filter((u) => u.controller !== site.controller && !u.stealth && u.name !== 'Free City')
        .map((u) => u.id)
      if (!enemies.length) return ctx.log('No enemy stands in the city.')
      ctx.ask({ kind: 'chooseTargets', title: 'The Free City musters against whom?', data: { candidates: enemies, count: 1, upTo: false, kind: 'unit' } }, 'fc:strike', { siteId: site.id })
    },
  }],
  onUnitAttacked: (ctx, target, attacker) => {
    // the city may rise to defend an ally within its walls
    const site = ctx.state.sites[ctx.sourceId]
    if (!site || site.controller === null) return
    if (target.controller !== site.controller || attacker.controller === site.controller) return
    if (!occupies(target, site.x, site.y, 'surface')) return
    if (ctx.state.flow?.freeCityUsed?.[site.id] === ctx.state.turn) return
    // make the city available as a defender; the defending player simply
    // leaves it untapped if they'd rather it stand aside
    freeCityPseudo(ctx.state, site.id)
  },
  onSiteAttacked: (ctx) => {
    // the city itself is under attack — it may rise to defend its own walls (a 3/3 that converts the
    // attacker's blows to life loss via damageBecomesLifeLoss). Offered as a defender; the controller
    // chooses whether to commit it.
    const site = ctx.state.sites[ctx.sourceId]
    if (!site || site.controller === null) return
    if (ctx.state.flow?.freeCityUsed?.[site.id] === ctx.state.turn) return
    freeCityPseudo(ctx.state, site.id)
  },
  conts: {
    'fc:strike': (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const site = ctx.state.sites[c.siteId as string]
      if (typeof id !== 'string' || !site || !ctx.state.units[id]) return
      const pseudo = freeCityPseudo(ctx.state, site.id)
      if (!pseudo || pseudo.tapped) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.freeCityUsed = { ...(ctx.state.flow.freeCityUsed ?? {}), [site.id]: ctx.state.turn }
      const err = beginAttack(ctx.state, pseudo, { unit: id }, { allowSubsurface: true }) // may strike down into its own subsurface
      if (err) {
        pushLog(ctx.state, ctx.controller, `The city cannot reach: ${err}`)
        return
      }
      pseudo.tapped = true
    },
  },
  onWouldDie: (state, selfId, dying) => {
    // the city-in-arms falling means the site falls to rubble
    if (dying.id !== selfId || dying.name !== 'Free City') return false
    const site = Object.values(state.sites).find((s) => s.cardId === dying.cardId)
    delete state.units[dying.id]
    if (site) destroySite(state, site.id)
    return true
  },
  endOfEveryTurn: (ctx) => {
    const site = ctx.state.sites[ctx.sourceId]
    if (!site) return
    const pseudo = Object.values(ctx.state.units).find((u) => u.cardId === site.cardId && u.name === 'Free City')
    if (!pseudo) return
    delete ctx.state.units[pseudo.id]
  },
})
