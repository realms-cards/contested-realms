import { registerScript } from '../registry'
import { pushLog, dealDamageToUnit } from '../../../engine/effects'
import { effKeywords, isUnmodifiable } from '../../../engine/statics'
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
    // a bearer that "can't be modified" (Monks of Kobalsa) can't gain the splash, as it can't gain the +1
    if (!bearer || isUnmodifiable(ctx.state, bearer)) return
    // the splash is part of the bearer's strike, so a Lethal bearer's splash is lethal too (codex Lethal)
    const lethal = !!effKeywords(ctx.state, bearer).lethal
    for (const u of unitsAt(ctx.state, victim.x, victim.y, victim.region)) {
      if (u.id === victim.id || u.controller === bearer.controller) continue
      dealDamageToUnit(ctx.state, u, amount, bearer.controller, {
        // credit the BEARER for the splash (sourceUnitId) — it's the unit whose weapon deals it, so a
        // splash kill counts toward the bearer's "attacks and kills" triggers (Battlemage draws per
        // enemy its attack fells) and the "(killed by …)" log, exactly like its direct strike.
        source: { player: bearer.controller, kind: 'effect', name: 'Flaming Sword', sourceUnitId: bearer.id },
        lethal: lethal && !u.isAvatar,
      })
      pushLog(ctx.state, ctx.controller, `Flames splash onto ${u.name}!`)
    }
    // no death check here: the splash is part of the bearer's strike, so its kills die when that strike's
    // exchange settles (dealDamageToUnit settles at once only outside a fight/damage event)
  },
})
