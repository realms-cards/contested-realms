import { registerScript } from '../registry'
import { asAreaDamage, checkStateBased } from '../../../engine/effects'
import { aura2x2Squares, edgesConnected, GRID_W } from '../../../engine/grid'
import { removeAura } from '../multi-card-utils/remove-aura'

// 'At the end of each turn, minions on the surface burn. Those here take 20 damage, those elsewhere take 1.
//  Then the sun must move one step westward or it is dispelled.' (printed wording on the card image)
// A plain 2x2 aura. Every minion on the surface — anywhere in the realm, either side's — burns at once (one
// area event): 20 inside the sun's four squares, 1 everywhere else; avatars and subsurface/void minions are
// untouched (FAQ: not even minions in the void — only "minions on the surface burn"). Then the sun shifts
// its 2x2 one column west. Codex "East and West": "From the First Player's point of view, the East is the
// eight squares to the right of the central column. The West is the eight squares to the left" — so west
// is fixed by the FIRST player's seat (their left: -x for player 0, +x for player 1, as each seat's board
// is drawn), whoever controls the sun. If it can't (it already touches the west edge), it is dispelled.
// With Magellan Globe the edges are joined and it wraps around — forever (FAQ: "that is how the sun works").
registerScript('None Survive the Sun', {
  endOfEveryTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    const inSun = (x: number, y: number) => aura.squares.some((s) => s.x === x && s.y === y)
    asAreaDamage(ctx.state, () => {
      for (const u of Object.values(ctx.state.units)) {
        if (u.isAvatar || u.region !== 'surface') continue
        ctx.dealDamage({ unit: u.id }, inSun(u.x, u.y) ? 20 : 1)
      }
    })
    ctx.settleDeaths()
    ctx.log('☀️ None survive the sun.')
    const live = ctx.state.auras[ctx.sourceId]
    if (!live) return // an animated sun burned itself away
    const wrap = edgesConnected(ctx.state)
    const anchor = live.anchor ?? { x: Math.min(...live.squares.map((s) => s.x)), y: Math.min(...live.squares.map((s) => s.y)) }
    // an Enchantress-animated sun is a creature embodying the aura (Wildfire, Thunderstorm do the same)
    const body = Object.values(ctx.state.units).find((u) => String(u.counters?.animatedAura ?? '') === live.id)
    const west = ctx.state.firstPlayer === 0 ? -1 : 1
    const next = { x: anchor.x + west, y: anchor.y }
    if (next.x < 0 || next.x > GRID_W - 2) {
      if (!wrap) {
        ctx.log('The sun sets beyond the western edge of the realm.')
        if (!body) return removeAura(ctx)
        // dispelling an animated aura kills the creature it animated (its shared card → cemetery once)
        delete ctx.state.auras[ctx.sourceId]
        return checkStateBased(ctx.state)
      }
      next.x = ((next.x % GRID_W) + GRID_W) % GRID_W
    }
    if (body) ctx.teleport(body.id, ((body.x + west) % GRID_W + GRID_W) % GRID_W, body.y, body.region)
    const moved = ctx.state.auras[ctx.sourceId]
    if (!moved) return
    moved.anchor = next
    moved.squares = aura2x2Squares(next, wrap)
  },
})
