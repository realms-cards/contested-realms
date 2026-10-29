import { registerScript } from '../registry'
import { pushLog, avatarTrapBlocksMove, moveProtected } from '../../../engine/effects'
import { siteEntryAllowed } from '../../../engine/movement'
import type { UnitState } from '../../../engine/types'

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
    // FAQ: "If there is no legal path that will get both of the involved units to the Dungeon, there will
    // be no movement" — so neither is dragged when the other can't be (can't be moved by force, an enemy
    // Anchorman, Cage of Sidrak, a site it can't be dragged into)
    const caged = (u: UnitState) => (ctx.state.flow?.cagedUnits ?? []).some((c: { unitId: string }) => c.unitId === u.id)
    const draggable = (u: UnitState) => (u.x === self.x && u.y === self.y && u.region === 'surface') || (
      !caged(u) && !moveProtected(ctx.state, u, ctx.controller) &&
      siteEntryAllowed(ctx.state, u, { x: u.x, y: u.y, region: u.region }, { x: self.x, y: self.y, region: 'surface' }, true, true))
    if (!draggable(striker) || !draggable(avatar)) return
    ctx.state.flow.darkestDungeon = null
    ctx.teleport(striker.id, self.x, self.y, 'surface', { push: true }) // forced drag: Cage/push-ban aware
    ctx.teleport(avatar.id, self.x, self.y, 'surface', { push: true })
    pushLog(ctx.state, ctx.controller, `${striker.name} and ${avatar.name} are dragged into the Darkest Dungeon!`)
  },
})
