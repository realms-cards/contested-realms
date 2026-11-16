// Shared helpers for magic spell card scripts (no registerScript — skipped by gen:card-index).

import { type EffectAPI, type CardScript } from '../registry'
import { firstProjectileImpact } from '../../../engine/combat'
import { effectSummonUnit } from '../../../engine/effects'

// after the (possibly Lucky-bent) minion is chosen, pick where to summon it (FAQ: anywhere)
export function raiseAsk(ctx: EffectAPI, pick: string): void {
  ctx.log(`Fate chooses ${ctx.state.cards[pick].name}...`)
  ctx.ask({ kind: 'chooseSquare', title: `Summon ${ctx.state.cards[pick].name} where?`, data: {} }, 'rise', { pick })
}

/** "Shoot a projectile" magics whose shot hits ONE unit (Fireball, Frostbolt): the direction is chosen
 *  at cast (`shootsProjectile`), the projectile stops at the first location with a hittable unit, and the
 *  CASTER picks which unit there is hit (rulebook) before `onHit` resolves the card's effect. */
export function impactProjectileScript(
  pickTitle: string,
  onHit: (ctx: EffectAPI, unitId: string, at: { x: number; y: number }) => void,
  /** false when the effect covers the whole hit location, so WHICH unit there was hit changes nothing */
  pickUnit = true,
): CardScript {
  return {
    shootsProjectile: true,
    onCast: (ctx) => {
      const dir = ctx.extra?.direction
      const c = ctx.caster!
      if (!dir || (dir !== 'n' && dir !== 's' && dir !== 'e' && dir !== 'w')) return ctx.log('Fizzled: no direction chosen.')
      // firstProjectileImpact stops at the first square holding a hittable unit and also void-stops;
      // hittable = projectileCanHit (Stealth, Crawling Congregation…)
      const impact = firstProjectileImpact(ctx.state, {
        player: ctx.controller, ox: c.x, oy: c.y, region: c.region, dir: String(dir), excludeId: c.id,
      })
      if (!impact) return ctx.log('The projectile flies off the realm.')
      // `at`: the square the projectile hit — for an oversized unit, not necessarily its anchor
      const at = { x: impact.x, y: impact.y }
      if (impact.candidates.length === 1 || !pickUnit) return onHit(ctx, impact.candidates[0], at)
      ctx.ask({ kind: 'chooseTargets', title: pickTitle, data: { candidates: impact.candidates, count: 1, kind: 'unit', upTo: false } }, 'impactPick', { at, candidates: impact.candidates })
    },
    conts: {
      impactPick: (ctx, c, choice) => {
        const id = Array.isArray(choice) ? choice[0] : choice
        const at = c.at as { x: number; y: number }
        if (typeof id === 'string' && (c.candidates as string[]).includes(id)) onHit(ctx, id, at)
      },
    },
  }
}
