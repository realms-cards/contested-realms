import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'As you summon this Mimic, you may transform a carriable artifact into it,
// under your control.' → when cast, the player may pick a carriable artifact ANYWHERE
// (ground or carried, even an enemy's / subsurface one); the Mimic is summoned at that
// artifact's exact location+region under the caster's control and the artifact is consumed.
// The placement is handled by the cast flow (see casting.ts); here we just consume the
// chosen artifact (identified by ctx.extra.mimicArtifact). A normal square-summon Mimic
// transforms nothing.
registerScript('Mimic', {
  summonTargetsCarriable: true,
  genesis: (ctx) => {
    const artId = ctx.extra?.mimicArtifact
    if (!artId) return
    const art = ctx.state.artifacts[artId]
    if (!art) return
    if (art.carriedBy) {
      const carrier = ctx.state.units[art.carriedBy]
      if (carrier) carrier.carrying = carrier.carrying.filter((x) => x !== art.id)
    }
    // transformed: the original is removed from the game
    const card = ctx.state.cards[art.cardId]
    if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
    delete ctx.state.artifacts[art.id]
    pushLog(ctx.state, ctx.controller, `${art.name} was a Mimic all along!`)
  },
})
