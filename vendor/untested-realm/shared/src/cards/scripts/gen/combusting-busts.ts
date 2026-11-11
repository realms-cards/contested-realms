import { registerScript, type EffectAPI } from '../registry'
import { adjacentSquaresW, siteAt, unitsAt } from '../../../engine/grid'
import type { Region } from '../../../engine/types'
import { trapScript } from '../multi-card-utils/trap'

// 'Trap (4) → Deal 3 damage to each unit at another target adjacent location.'
// Another location adjacent to this site, in a site's regions only (rulebook: adjacent locations share
// the referencing card's region, and a site is its surface and what lies below it — never a void): a
// bordering site's surface or the location below it, or the location below this site itself (only its
// own surface is "this" one). When a square offers more than one such location, you choose which.
function locationsAt(ctx: EffectAPI, x: number, y: number): Region[] {
  const site = ctx.state.sites[ctx.sourceId]
  const own = !!site && site.x === x && site.y === y
  if (!siteAt(ctx.state, x, y)) return []
  const below = [...new Set(unitsAt(ctx.state, x, y).map((u) => u.region).filter((r) => r !== 'surface' && r !== 'void'))]
  return own ? below : ['surface', ...below]
}

function squares(ctx: EffectAPI): { x: number; y: number }[] {
  const site = ctx.state.sites[ctx.sourceId]
  if (!site) return []
  return adjacentSquaresW(ctx.state, site.x, site.y).filter((s) => locationsAt(ctx, s.x, s.y).length > 0)
}

function blast(ctx: EffectAPI, x: number, y: number, region: Region): void {
  for (const u of unitsAt(ctx.state, x, y, region)) ctx.dealDamage({ unit: u.id }, 3)
  ctx.log('The busts combust!')
}

registerScript('Combusting Busts', trapScript({
  label: '3 damage to each unit at another adjacent location',
  mana: 4,
  effect: (ctx) => {
    const sq = squares(ctx)
    if (sq.length) ctx.ask({ kind: 'chooseSquare', title: 'Combusting Busts: blast which adjacent location?', data: { squares: sq } }, 'where')
  },
  conts: {
    where: (ctx, _c, sq) => {
      if (!sq || !squares(ctx).some((s) => s.x === sq.x && s.y === sq.y)) return
      const regions = locationsAt(ctx, sq.x, sq.y)
      if (regions.length === 1) return blast(ctx, sq.x, sq.y, regions[0])
      ctx.ask({ kind: 'chooseOption', title: 'Combusting Busts: above or below?', data: { options: regions } }, 'region', { x: sq.x, y: sq.y })
    },
    region: (ctx, c, choice) => {
      if (typeof choice === 'string' && locationsAt(ctx, c.x as number, c.y as number).includes(choice as Region)) blast(ctx, c.x as number, c.y as number, choice as Region)
    },
  },
}))
