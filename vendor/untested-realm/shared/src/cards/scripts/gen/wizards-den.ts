import { registerScript } from '../registry'

// 'Genesis → Draw a spell. Discard a spell when this site is first attacked successfully.'
registerScript("Wizard's Den", {
  genesis: (ctx) => ctx.draw(ctx.controller, 'spellbook'),
  onSiteDamaged: (ctx, site) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || site.id !== self.id) return
    if ((self as any).denRaided) return
    ;(self as any).denRaided = true
    // "Discard a spell" — never a site (rulebook: any hand card that isn't a
    // site is a spell). If no spell is held, the instruction simply fizzles.
    ctx.discardChoose(ctx.controller, { spellsOnly: true, title: 'The Den is raided — discard which spell?' })
  },
})
