import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import { makeCtx } from '../../../engine/effects'
import { getScript as requireScript } from '../registry'

// 'Burrowing / Whenever this unburrows, you may trigger the Genesis of a nearby Desert.'
registerScript('Khamaseen Mummy', {
  onUnitEntersSquare: (ctx, moved, from) => {
    if (moved.id !== ctx.sourceId) return
    if (from.region !== 'underground' || moved.region !== 'surface') return
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const deserts = nearbySquaresW(ctx.state, self.x, self.y)
      .map((s) => siteAt(ctx.state, s.x, s.y))
      .filter((s): s is NonNullable<typeof s> => !!s && s.name.includes('Desert'))
    if (!deserts.length) return
    if (deserts.length === 1) {
      ctx.ask({ kind: 'yesNo', title: `Trigger ${deserts[0].name}'s Genesis?` }, 'sandstorm', { siteId: deserts[0].id })
      return
    }
    // several nearby Deserts → choose which one (or decline)
    ctx.ask(
      { kind: 'chooseOption', title: "Trigger which Desert's Genesis?", data: { options: [...deserts.map((d) => d.name), '(none)'] } },
      'sandChoose',
      { desertIds: deserts.map((d) => d.id) },
    )
  },
  conts: {
    sandstorm: (ctx, contCtx, choice) => {
      if (!choice) return
      triggerDesertGenesis(ctx, contCtx.siteId as string)
    },
    sandChoose: (ctx, c, choice) => {
      if (!choice || choice === '(none)') return
      const desertIds = c.desertIds as string[]
      const siteId = desertIds.find((id) => ctx.state.sites[id]?.name === choice)
      if (siteId) triggerDesertGenesis(ctx, siteId)
    },
  },
})

function triggerDesertGenesis(ctx: EffectAPI, siteId: string) {
  const site = ctx.state.sites[siteId]
  if (!site) return
  const script = requireScript(site.name)
  if (script?.genesis && site.controller !== null) {
    // Run the Desert's genesis under ITS OWN effect context (makeCtx bound to the site), NOT a spread of
    // the Mummy's ctx. ctx.ask files continuations under the CLOSURED sourceId, so a spread just overrides
    // the property while ask still closes over the Mummy's id — any follow-up prompt the genesis raises
    // (Vast Desert's "scour") then crashes as "No continuation script:Khamaseen Mummy:scour".
    script.genesis(makeCtx(ctx.state, site.id, site.controller, []))
  }
}
