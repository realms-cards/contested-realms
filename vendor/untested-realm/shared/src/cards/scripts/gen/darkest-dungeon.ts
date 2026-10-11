import { registerScript } from '../registry'
import { pushLog, avatarTrapBlocksMove } from '../../../engine/effects'

// 'Genesis → The next time an ally strikes an Avatar this turn, drag both here if able.'
registerScript('Darkest Dungeon', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.darkestDungeon = { siteId: ctx.sourceId, player: ctx.controller, turn: ctx.state.turn }
    pushLog(ctx.state, ctx.controller, 'The dungeon doors creak open in anticipation…')
  },
  onAllyStrikesAvatar: (ctx, striker, avatar) => {
    const f = ctx.state.flow?.darkestDungeon
    const self = ctx.state.sites[ctx.sourceId]
    if (!f || !self || f.siteId !== ctx.sourceId || f.turn !== ctx.state.turn) return
    if (striker.controller !== f.player) return
    // "drag both here IF ABLE": a trapped avatar (Sphere of Animosity) can't be moved OUT of its
    // area. If the Darkest Dungeon sits outside that trap, the avatar can't be dragged there, so
    // the effect can't happen — don't activate (leave it armed for a later legal strike). Checked
    // up-front so the effect never half-fires (dragging the striker but stranding the avatar).
    if (avatarTrapBlocksMove(ctx.state, avatar, self.x, self.y)) return
    ctx.state.flow.darkestDungeon = null
    ctx.teleport(striker.id, self.x, self.y, 'surface', { push: true }) // forced drag: Cage/push-ban aware
    ctx.teleport(avatar.id, self.x, self.y, 'surface', { push: true })
    pushLog(ctx.state, ctx.controller, `${striker.name} and ${avatar.name} are dragged into the Darkest Dungeon!`)
  },
})
