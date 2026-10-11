import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'
import { Cell, Dir, applyGrid, mergeCells, resolveCells } from '../multi-card-utils/apply-grid'

// 'May be cast by an allied Mortal. Choose two different cardinal directions...
// [arm: 2 at dist 1, 1 at dist 2]'
const BURNING_HANDS_ARM: Cell[] = [{ dx: 0, dy: 1, dmg: 2 }, { dx: 0, dy: 2, dmg: 1 }]

registerScript('Burning Hands', {
  // EXPANSION arm: adds Mortals to the caster set (the avatar & Spellcasters still
  // cast it via the normal path in canCast). No isAvatar guard needed — the normal
  // path already accepts the avatar before this filter is consulted.
  casterFilter: (state, caster) =>
    hasSubtype(state, caster, 'Mortal') ? null : 'Only an allied Mortal may cast Burning Hands.',
  areaDamage: (state, casterId, params) => {
    const caster = state.units[casterId]
    if (!caster || !params.direction) return null
    // preview the first arm as soon as it's chosen; add the second once picked
    const cells = [...resolveCells(state, caster, BURNING_HANDS_ARM, params.direction)]
    if (params.direction2) cells.push(...resolveCells(state, caster, BURNING_HANDS_ARM, params.direction2))
    return mergeCells(cells)
  },
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'First hand burns which way?', data: { options: ['n', 's', 'e', 'w'] } }, 'hand1')
  },
  conts: {
    hand1: (ctx, _c, d1) => {
      if (!d1) return
      const rest = ['n', 's', 'e', 'w'].filter((d) => d !== d1)
      ctx.ask({ kind: 'chooseOption', title: 'Second hand burns which way?', data: { options: rest } }, 'hand2', { d1 })
    },
    hand2: (ctx, contCtx, d2) => {
      const caster = ctx.caster!
      applyGrid(ctx, caster, BURNING_HANDS_ARM, contCtx.d1 as Dir)
      if (d2) applyGrid(ctx, caster, BURNING_HANDS_ARM, d2 as Dir)
    },
  },
})
