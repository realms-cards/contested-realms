import { registerScript } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { siteSilenced } from '../../../engine/statics'
import { pushLog, dealDamageToUnit } from '../../../engine/effects'

// (Moss Troll moved to its own file: gen/moss-troll.ts — one-file-per-card refactor pilot.)

// Druid avatar (Arthurian Legends, double-faced). Errata (FAQ):
//   FRONT: Tap → Play or draw a site. If this is your first turn, summon Tawny here.
//          Tap → Summon Bruin here. Flip this card.
//   BACK (flipped): Tap → Play or draw a site.
//          Nearby allied sites have "Whenever an enemy enters here, it takes 1 damage."
// `unit.flipped` selects the side: front abilities/Tawny only while unflipped, the
// site-damage aura only while flipped. The standard "Tap → Play or draw a site" is the
// common avatar site action, shared by both sides via the engine, so it needs no script.
registerScript('Druid', {
  // "If this is your first turn, summon Tawny here" — rides EVERY first-turn site play,
  // including the FORCED establishment (turn.ts also invokes afterAvatarSitePlay now).
  afterAvatarSitePlay: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.flipped) return
    if (ctx.state.turn !== (ctx.controller === ctx.state.firstPlayer ? 1 : 2)) return // not your first turn
    if (Object.values(ctx.state.units).some((u) => u.name === 'Tawny' && u.controller === ctx.controller)) return
    ctx.summonToken('Tawny', ctx.controller, self.x, self.y, self.region)
  },
  abilities: [{
    key: 'bruin',
    label: 'Summon Bruin here — then flip',
    cost: { tap: true },
    flipsSelf: true, // a masked Imposter is denied this (see m52) — flipping would cost it the game
    available: (state, id) => !state.units[id]?.flipped,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || self.flipped) return
      ctx.summonToken('Bruin', ctx.controller, self.x, self.y, self.region)
      self.flipped = true // the Druid turns to its back side (art + rules swap)
      pushLog(ctx.state, ctx.controller, `${self.name} flips to a force of nature — Bruin lumbers forth.`)
    },
  }],
  // flip side only: an enemy entering a nearby allied site takes 1 damage. Per FAQ the
  // SITE grants/deals it (no Druid kill credit, no Poisonous-Dagger lethality), and a
  // silenced/unmodifiable site loses the ability.
  onUnitEntersSquare: (ctx, moved) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !self.flipped || moved.controller === ctx.controller) return
    const site = siteAt(ctx.state, moved.x, moved.y)
    if (!site || site.controller !== ctx.controller || siteSilenced(ctx.state, site)) return
    if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === site.x && s.y === site.y)) return
    dealDamageToUnit(ctx.state, moved, 1, ctx.controller, { source: { player: ctx.controller, kind: 'ability', name: site.name } })
    pushLog(ctx.state, ctx.controller, 'Thorns lash out at the intruder.')
  },
})
