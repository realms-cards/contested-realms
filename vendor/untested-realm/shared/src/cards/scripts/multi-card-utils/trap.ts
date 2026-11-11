import type { CardScript, EffectAPI, TargetRef, TargetSpec } from '../registry'
import type { GameState, PlayerId, SiteState, Thresholds } from '../../../engine/types'
import { legalTargetsFor } from '../../../engine/casting'
import { abilityAnchor } from '../../../engine/grid'

/** every legal pick for a trap's "target …" `spec`, measured from the trap site — the same legality
 *  (range, Stealth, region, filter) as any targeted ability */
export function trapTargets(state: GameState, siteId: string, player: PlayerId, spec: TargetSpec): TargetRef[] {
  // the trap's REAL card is the source (a face-down trap's site name is its disguise)
  const source = state.sites[siteId]?.trap?.realName ?? state.sites[siteId]?.name
  return legalTargetsFor(state, { script: undefined, specs: [spec], caster: abilityAnchor(state, siteId, player), player, source }, [])
}

/** A "Trap (N) → effect" site (Frost Mage vs Lavamancer). It is played face-down as the basic site of
 *  its element and sprung by paying N (engine/traps.ts, game.ts trapSpringAbility); Trapper's Rest can
 *  reactivate it once face-up (trap-reactivate.ts). The effect runs with ctx.sourceId = the site and
 *  ctx.controller = the player springing it; it picks its own targets with prompts, so a spring and a
 *  reactivation resolve the same way. Springing needs nothing but its cost ("you may pay a Trap's cost to
 *  flip it faceup"), so `available` is only for a "target …" trap with no legal target. */
export function trapScript(opts: {
  label: string
  mana: number
  threshold?: Partial<Thresholds>
  available?: (state: GameState, site: SiteState, player: PlayerId) => boolean
  effect: (ctx: EffectAPI, site: SiteState) => void
  conts?: CardScript['conts']
}): CardScript {
  const available = opts.available
  return {
    siteTrap: true,
    siteTrapAbility: {
      label: `Spring the trap: ${opts.label}`,
      cost: { mana: opts.mana },
      threshold: opts.threshold,
      available: available
        ? (state, siteId, player) => {
          const site = state.sites[siteId]
          return !!site && available(state, site, player)
        }
        : undefined,
      effect: (ctx) => {
        const site = ctx.state.sites[ctx.sourceId]
        if (site) opts.effect(ctx, site)
      },
    },
    conts: opts.conts,
  }
}
