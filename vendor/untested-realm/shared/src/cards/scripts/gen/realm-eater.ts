import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Tap → Play, draw, or digest a site. / Destroys sites it successfully attacks,
//  then becomes immobile until it digests.'
registerScript('Realm-Eater', {
  onStrikeSite: (ctx, siteId) => {
    const self = ctx.state.units[ctx.sourceId]
    const site = ctx.state.sites[siteId]
    if (!self || !site) return
    ctx.destroySite(siteId)
    // each devoured site is another meal in the queue — stack them
    self.counters = { ...self.counters, mustDigest: (self.counters?.mustDigest ?? 0) + 1 }
    pushLog(ctx.state, ctx.controller, `The Realm-Eater devours ${site.name} whole — and slumps, gorged.`)
  },
  selfKeywords: (_state, self) => ((self.counters?.mustDigest ?? 0) > 0 ? ['immobile'] : []),
  abilities: [{
    key: 'digest',
    label: 'Tap → Digest the eaten site',
    cost: { tap: true },
    // only offered when there is a devoured site left to digest…
    available: (state, sourceId) => (state.units[sourceId]?.counters?.mustDigest ?? 0) > 0,
    // …and the button shows how many meals remain: "Tap → Digest the eaten site (2)"
    dynamicLabel: (state, sourceId) => `Tap → Digest the eaten site (${state.units[sourceId]?.counters?.mustDigest ?? 0})`,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const left = self.counters?.mustDigest ?? 0
      if (left <= 0) {
        self.tapped = false
        return ctx.log('Nothing to digest.')
      }
      if (left <= 1) delete self.counters!.mustDigest
      else self.counters!.mustDigest = left - 1
      const now = self.counters?.mustDigest ?? 0
      pushLog(
        ctx.state,
        ctx.controller,
        now > 0
          ? `The Realm-Eater digests a meal — ${now} still churning.`
          : 'The Realm-Eater digests its last meal and stirs again.',
      )
    },
  }],
})
