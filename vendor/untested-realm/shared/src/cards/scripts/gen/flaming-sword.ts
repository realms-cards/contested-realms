import { registerScript } from '../registry'
import { pushLog, dealDamageToUnit, checkStateBased } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Bearer has +1 power, and its strikes splash full damage to each other enemy
//  at a struck unit's location.'
registerScript('Flaming Sword', {
  artifactGrantsPower: (state, artifactId, unit) => (state.artifacts[artifactId]?.carriedBy === unit.id ? 1 : 0),
  onUnitDamaged: (ctx, victim, amount, source) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    // triggers on any STRIKE by the bearer — a melee strike OR a Ranged-ability hit (kind:'projectile'
    // carries the bearer's attackerId; spell/other-unit projectiles use kind:'effect' with no attackerId,
    // so they never trip this). A ranged hit is a strike, so Flaming Sword splashes from it too.
    if (!art || (source?.kind !== 'strike' && source?.kind !== 'projectile') || source.attackerId !== art.carriedBy) return
    const bearer = ctx.state.units[art.carriedBy!]
    if (!bearer) return
    for (const u of unitsAt(ctx.state, victim.x, victim.y, victim.region)) {
      if (u.id === victim.id || u.controller === bearer.controller) continue
      dealDamageToUnit(ctx.state, u, amount, bearer.controller, {
        // credit the BEARER for the splash (sourceUnitId) — it's the unit whose weapon deals it, so a
        // splash kill counts toward the bearer's "attacks and kills" triggers (Battlemage draws per
        // enemy its attack fells) and the "(killed by …)" log, exactly like its direct strike.
        source: { player: bearer.controller, kind: 'effect', name: 'Flaming Sword', sourceUnitId: bearer.id },
      })
      pushLog(ctx.state, ctx.controller, `Flames splash onto ${u.name}!`)
    }
    checkStateBased(ctx.state)
  },
})
