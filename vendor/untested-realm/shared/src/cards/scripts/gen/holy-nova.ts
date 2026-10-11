import { registerScript, type EffectAPI } from '../registry'
import { Cell, applyGrid } from '../multi-card-utils/apply-grid'

// 'Deal damage to each ENEMY at affected locations [1 2 1 / 2 3 2 / 1 2 1].
// You may break an allied Ward to center this on that location instead.'
registerScript('Holy Nova', {
  onCast: (ctx) => {
    // "break an allied Ward to center this" — the Ward may be on a unit OR a site you control
    const wardIds = [
      ...Object.values(ctx.state.units).filter((u) => u.controller === ctx.controller && u.ward).map((u) => u.id),
      ...Object.values(ctx.state.sites).filter((s) => s.controller === ctx.controller && s.ward).map((s) => s.id),
    ]
    if (!wardIds.length) return holyNova(ctx, ctx.caster!)
    ctx.ask(
      { kind: 'chooseTargets', title: 'Break a Ward to center the Nova there (skip = center on caster)?', data: { candidates: wardIds, count: 1, upTo: true, kind: 'unitOrSite' } },
      'nova',
    )
  },
  conts: {
    nova: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const anchorU = typeof id === 'string' ? ctx.state.units[id] : null
      const anchorS = typeof id === 'string' ? ctx.state.sites[id] : null
      if (anchorU?.ward) { anchorU.ward = false; holyNova(ctx, anchorU) }
      else if (anchorS?.ward) { anchorS.ward = false; holyNova(ctx, anchorS) }
      else holyNova(ctx, ctx.caster!)
    },
  },
})

function holyNova(ctx: EffectAPI, center: { x: number; y: number }) {
  const cells: Cell[] = [
    { dx: 0, dy: 0, dmg: 3 },
    { dx: 1, dy: 0, dmg: 2 }, { dx: -1, dy: 0, dmg: 2 }, { dx: 0, dy: 1, dmg: 2 }, { dx: 0, dy: -1, dmg: 2 },
    { dx: 1, dy: 1, dmg: 1 }, { dx: -1, dy: 1, dmg: 1 }, { dx: 1, dy: -1, dmg: 1 }, { dx: -1, dy: -1, dmg: 1 },
  ]
  applyGrid(ctx, center, cells, 'n', { enemiesOnly: true })
}
