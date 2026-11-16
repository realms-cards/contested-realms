import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { GameState, PlayerId } from '../../../engine/types'

// 'Stealth, Can't be disabled / (1), Banish this from your cemetery → An ally gains "Stealth, Can't be disabled."'
// Codex, Stealth: granting "Stealth" is shorthand for a Stealth mark, and only minions can hold one; an Avatar
// can't be disabled anyway — so the grant is offered to allied MINIONS only. It has no duration: permanent.

const allyMinions = (state: GameState, player: PlayerId) =>
  Object.values(state.units).filter((u) => u.controller === player && !u.isAvatar)

function foxGrant(ctx: EffectAPI, unitId: string): void {
  const u = ctx.state.units[unitId]
  if (!u || u.controller !== ctx.controller || u.isAvatar) return
  u.stealth = true
  ctx.grantKeyword(u.id, 'undisableable', 'permanent')
  ctx.log(`${u.name} gains Stealth and can't be disabled.`)
}

registerScript('Arctic Fox', {
  immuneToDisable: true,
  cemeteryAbilities: (_state, cardId, owner) => [{
    key: `arcticFox:${cardId}`,
    label: '(1), Banish this from your cemetery → an ally gains "Stealth, Can\'t be disabled"',
    cost: { mana: 1 },
    contOwner: 'Arctic Fox',
    available: (s) => s.players[owner].cemetery.includes(cardId) && allyMinions(s, owner).length > 0,
    effect: (ctx) => {
      // the banish is part of the cost: the card leaves the cemetery before the ally is chosen
      const pl = ctx.state.players[ctx.controller]
      const idx = pl.cemetery.indexOf(cardId)
      if (idx < 0) return
      pl.cemetery.splice(idx, 1)
      pl.banished.push(cardId)
      pushLog(ctx.state, ctx.controller, 'Arctic Fox is banished from the cemetery.')
      const allies = allyMinions(ctx.state, ctx.controller)
      if (!allies.length) return
      if (allies.length === 1) return foxGrant(ctx, allies[0].id)
      ctx.ask({ kind: 'chooseTargets', title: 'Which ally gains "Stealth, Can\'t be disabled"?', data: { candidates: allies.map((u) => u.id), count: 1, upTo: false, kind: 'unit' } }, 'grant')
    },
  }],
  conts: {
    grant: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? (choice[0] as string) : (choice as string)
      if (id) foxGrant(ctx, id)
    },
  },
})
