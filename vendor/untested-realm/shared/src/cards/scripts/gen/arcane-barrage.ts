import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// ---- X-cost spells (X = mana you choose to spend on resolution) ----

// 'Shoot X projectiles in the same direction, one at a time. Each deals 1 damage.'
registerScript('Arcane Barrage', {
  // X is paid as mana during resolution, not as the printed (0) cast cost — so a cost discount
  // (Merlin's Tower "costs 3 less") must be applied to X here. castSpell stashes any matched discount
  // into flow.xCostDiscount for us (see the xCostSpell flag).
  xCostSpell: true,
  // X is the mana you spend, so casting needs at least (1) — unless a discount makes the first few
  // projectiles free (Merlin's Tower: free for X<=3). Gating here (as Twist of Fate does) makes canCast
  // reject a cast that could do nothing, so the GUI won't let you throw the card away for nothing.
  extraCastCheck: (state, player) => {
    if (state.players[player].mana >= 1) return null
    const disc = (state.flow?.spellDiscounts ?? []).some((d: any) =>
      d.player === player && (d.turn === undefined || d.turn === state.turn) && (d.amount ?? 0) >= 1 &&
      (!d.elements || d.elements.includes('air')))
    return disc ? null : 'Arcane Barrage needs at least (1) mana to spend on X.'
  },
  onCast: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const d = ctx.state.flow?.xCostDiscount
    const disc = d && d.player === ctx.controller ? (d.amount ?? 0) : 0
    if (ctx.state.flow?.xCostDiscount) delete ctx.state.flow.xCostDiscount // consume it (carried via cont ctx below)
    const max = p.mana + disc // the discount lets you fire up to `disc` extra projectiles for free
    if (max <= 0) return ctx.log('No mana left for X.')
    const options = Array.from({ length: max }, (_, i) => String(i + 1))
    ctx.ask({ kind: 'chooseOption', title: `Arcane Barrage: choose X (you have ${p.mana} mana${disc ? `, first ${disc} free` : ''})`, data: { options } }, 'chooseX', { disc })
  },
  conts: {
    chooseX: (ctx, c, choice) => {
      const x = Number(choice) || 0
      if (x <= 0) return
      const p = ctx.state.players[ctx.controller]
      const disc = (c.disc as number) ?? 0
      const toSpend = Math.max(0, x - disc) // "costs 3 less": free when X <= discount
      if (p.mana < toSpend) return
      if (toSpend > 0) ctx.spendMana(ctx.controller, toSpend)
      ctx.ask({ kind: 'chooseOption', title: 'Barrage in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'barrage', { x })
    },
    barrage: (ctx, contCtx, dir) => {
      const caster = ctx.caster!
      if (!dir) return
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: caster.x, oy: caster.y, region: caster.region,
        dir: String(dir), volleys: contCtx.x, damage: 1, excludeId: caster.id, srcName: 'Arcane Barrage',
      })
    },
  },
})
