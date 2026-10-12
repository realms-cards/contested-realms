import { registerScript, type EffectAPI } from '../registry'
import { wardUnit } from '../../../engine/effects'
import { firstProjectileImpact } from '../../../engine/combat'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Bearer has "Tap, Sacrifice this Holy Water → Throw a projectile. If it hits a
// minion, banish it if Evil, Ward it if not."'
registerScript('Holy Water', {
  abilities: [{
    key: 'splash',
    label: 'Throw the Holy Water',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer || bearer.tapped) return ctx.log('The bearer must be untapped.')
      bearer.tapped = true
      ctx.ask({ kind: 'chooseOption', title: 'Throw in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'splash', { from: { x: bearer.x, y: bearer.y }, region: bearer.region })
    },
  }],
  conts: {
    splash: (ctx, contCtx, dir) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art || !dir) return
      ctx.breakArtifact(art.id)
      const impact = firstProjectileImpact(ctx.state, { player: ctx.controller, ox: contCtx.from.x, oy: contCtx.from.y, region: contCtx.region, dir: String(dir), avatarImmune: true })
      if (!impact) return
      if (impact.candidates.length === 1) return splashHit(ctx, impact.candidates[0])
      ctx.ask(
        { kind: 'chooseTargets', title: 'Which unit does the splash strike?', data: { candidates: impact.candidates, count: 1, kind: 'unit' } },
        'splashPick',
        {},
      )
    },
    splashPick: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') splashHit(ctx, id)
    },
  },
})

// printed "Ward it if not [Evil]" — banish an Evil unit, otherwise ward it
function splashHit(ctx: EffectAPI, id: string) {
  const hit = ctx.state.units[id]
  if (!hit) return
  if (isEvilU(ctx.state, hit)) ctx.banish(id)
  else wardUnit(ctx.state, hit)
}
