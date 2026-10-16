import { registerScript } from '../registry'

// 'Sacrifice the caster or lose half your life, rounding up. If you do, draw three cards.'
registerScript('Pact with the Devil', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    const options = caster.isAvatar
      ? ['Lose half your life']
      : ['Sacrifice the caster', 'Lose half your life']
    ctx.ask({ kind: 'chooseOption', title: 'Pact with the Devil', data: { options } }, 'pact', { pactCasterId: caster.id })
  },
  conts: {
    pact: (ctx, contCtx, choice) => {
      if (choice === 'Sacrifice the caster') {
        // The caster may be a minion, a spellcaster ARTIFACT (Omphalos) or a spellcaster SITE — any of them
        // can be sacrificed. `pactCasterId` is the resolved caster's id, which is the unit/artifact/site id.
        const id = contCtx.pactCasterId as string
        const unit = ctx.state.units[id]
        if (unit) {
          if (unit.isAvatar) return // the avatar is never sacrificed
          ctx.kill(unit.id)
        } else if (ctx.state.artifacts[id]) {
          ctx.breakArtifact(id)
        } else if (ctx.state.sites[id] && !ctx.state.sites[id].isRubble) {
          ctx.destroySite(id, ctx.controller, true) // a willing sacrifice (bypasses can't-be-destroyed/ward)
        } else {
          return // the caster already left the realm — nothing sacrificed, so no draw ("if you do")
        }
      } else {
        const avatar = ctx.state.units[ctx.state.players[ctx.controller].avatarUnitId]
        ctx.loseLife(ctx.controller, Math.ceil((avatar.life ?? 0) / 2))
      }
      ctx.drawCard(ctx.controller, 3)
    },
  },
})
