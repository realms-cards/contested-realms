import { registerScript } from '../registry'
import { pushLog, checkStateBased, toCemetery } from '../../../engine/effects'
import { nearbySquaresW, orthAdjacentWrapped, siteAt, unitsAt, squareLabel } from '../../../engine/grid'

// 'Conjure Wildfire atop a single site nearby. / At the end of each turn, each
//  unit here takes 3 damage, then move Wildfire to an adjacent location it
//  hasn't visited before. If none remain, dispel Wildfire.'
registerScript('Wildfire', {
  // Wildfire occupies ONE site (a 1×1 aura), so it is placed by picking a single square —
  // not the 2×2 intersection markers a normal aura uses.
  singleSiteAura: true,
  auraPlacement: (state, player, at, caster) => {
    const site = siteAt(state, at.x, at.y)
    if (!site) return 'Wildfire must be conjured atop a site.'
    // "nearby" is from the CASTER (a Spellcaster minion, an Omphalos, …), not always the avatar
    const from = caster ?? Object.values(state.units).find((u) => u.isAvatar && u.controller === player)
    if (from && !nearbySquaresW(state, from.x, from.y).some((s) => s.x === at.x && s.y === at.y))
      return 'Wildfire must start nearby.'
    return null
  },
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    const at = ctx.at
    if (!aura || !at) return
    // Wildfire is conjured ATOP A SITE — anchor it to that site's identity, not its coordinate,
    // so a site that later moves carries the fire with it (and stays "visited").
    const site = siteAt(ctx.state, at.x, at.y)
    aura.squares = [{ x: at.x, y: at.y }]
    aura.onSiteId = site?.id
    aura.counters = site ? ({ [`s:${site.id}`]: 1 } as any) : ({} as any)
  },
  endOfEveryTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    // Re-derive the fire's position from the SITE it sits on: if that site was moved/relocated
    // since last turn, the fire followed it. (Falls back to its last coordinate if the site is gone.)
    const curSite = aura.onSiteId ? ctx.state.sites[aura.onSiteId] : siteAt(ctx.state, aura.squares[0].x, aura.squares[0].y)
    const here = curSite ? { x: curSite.x, y: curSite.y } : aura.squares[0]
    aura.squares = [here]
    // Wildfire burns on the SURFACE only — a burrowed/submerged (subsurface) unit is safe underground.
    for (const u of unitsAt(ctx.state, here.x, here.y, 'surface')) ctx.dealDamage({ unit: u.id }, 3)
    // If Wildfire is ANIMATED (an Enchantress aura-minion embodies it), the burn may have
    // killed the creature ITSELF. Settle that first: a dead animated Wildfire has already
    // dispelled its aura (onAnyDeath) and filed its shared card, so nothing remains to spread.
    checkStateBased(ctx.state)
    const live = ctx.state.auras[ctx.sourceId]
    if (!live) return
    // it survived — the fire still keeps its aura effect and spreads; if animated, the creature
    // that embodies it travels WITH the fire.
    const animatedMinion = Object.values(ctx.state.units).find((u) => String(u.counters?.animatedAura ?? '') === live.id)
    // Spread only to an adjacent location that HAS a site the fire hasn't visited — keyed by the
    // site's id, so a site relocated onto a visited coordinate is still eligible (and vice-versa).
    const next = orthAdjacentWrapped(ctx.state, here.x, here.y) // adjacent, Magellan-aware
      .map((s) => ({ s, site: siteAt(ctx.state, s.x, s.y) }))
      .filter(({ site }) => site && !live.counters?.[`s:${site.id}`])
      .map(({ s }) => s)
    if (!next.length) {
      if (animatedMinion) {
        // nowhere left to burn: dispelling the aura kills the creature it animated (card → cemetery)
        delete ctx.state.auras[ctx.sourceId]
        checkStateBased(ctx.state)
      } else {
        const card = ctx.state.cards[live.cardId]
        if (card) toCemetery(ctx.state, card.id)
        delete ctx.state.auras[ctx.sourceId]
      }
      pushLog(ctx.state, ctx.controller, 'The Wildfire burns itself out.')
      return
    }
    ctx.ask({ kind: 'chooseSquare', title: 'The Wildfire spreads — to where?', data: { squares: next } }, 'spread', { animatedId: animatedMinion?.id })
  },
  conts: {
    spread: (ctx, c, sq) => {
      const aura = ctx.state.auras[ctx.sourceId]
      if (!aura || !sq) return
      // an ANIMATED Wildfire IS the creature — it travels with the fire (teleport drags the aura)
      const animated = c.animatedId ? ctx.state.units[c.animatedId as string] : null
      if (animated) ctx.teleport(animated.id, sq.x, sq.y, animated.region)
      // Attach to the site now under the fire (by id) — it will carry the fire if later moved.
      const site = siteAt(ctx.state, sq.x, sq.y)
      aura.squares = [{ x: sq.x, y: sq.y }]
      aura.onSiteId = site?.id
      aura.counters = { ...aura.counters, ...(site ? { [`s:${site.id}`]: 1 } : {}) }
      pushLog(ctx.state, ctx.controller, `🔥 The Wildfire leaps to ${squareLabel(sq.x, sq.y)}.`)
    },
  },
})
