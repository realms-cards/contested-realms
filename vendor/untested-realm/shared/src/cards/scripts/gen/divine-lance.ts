import { registerScript, type EffectAPI } from '../registry'
import { unitsAt } from '../../../engine/grid'

// 'Deal 1 damage to each minion at target site. You may break any number of
// allied Wards to increase the damage by 1 for each.'
registerScript('Divine Lance', {
  targets: [{ what: 'site', count: 1, targeted: true, label: 'target site' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    // "break any number of allied Wards" — the player CHOOSES which of their warded units
    // AND sites to shatter (each adds +1 damage); never an arbitrary engine pick.
    const wardIds = [
      ...Object.values(ctx.state.units).filter((u) => u.controller === ctx.controller && u.ward).map((u) => u.id),
      ...Object.values(ctx.state.sites).filter((s) => s.controller === ctx.controller && s.ward).map((s) => s.id),
    ]
    if (!wardIds.length) return divineLanceHit(ctx, t.site, 0)
    ctx.ask(
      { kind: 'chooseTargets', title: 'Break which allied Wards? (+1 damage each; skip for none)', data: { candidates: wardIds, count: wardIds.length, upTo: true, kind: 'unitOrSite' } },
      'lance',
      { siteId: t.site },
    )
  },
  conts: {
    lance: (ctx, contCtx, choice) => {
      const ids = Array.isArray(choice) ? choice.filter((x): x is string => typeof x === 'string') : []
      let broken = 0
      for (const id of ids) {
        const u = ctx.state.units[id]
        const s = ctx.state.sites[id]
        if (u && u.controller === ctx.controller && u.ward) { u.ward = false; broken++ }
        else if (s && s.controller === ctx.controller && s.ward) { s.ward = false; broken++ }
      }
      divineLanceHit(ctx, contCtx.siteId as string, broken)
    },
  },
})

function divineLanceHit(ctx: EffectAPI, siteId: string, bonus: number) {
  const site = ctx.state.sites[siteId]
  if (!site) return
  for (const u of unitsAt(ctx.state, site.x, site.y)) {
    if (!u.isAvatar) ctx.dealDamage({ unit: u.id }, 1 + bonus)
  }
}
