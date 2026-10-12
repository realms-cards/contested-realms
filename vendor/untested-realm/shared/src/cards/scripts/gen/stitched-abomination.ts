import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, pushPrompt, killUnit, registerCont } from '../../../engine/effects'
import { payZoneToll, cemeteryProtected } from '../../../engine/statics'
import type { GameState, PlayerId } from '../../../engine/types'

// 'Genesis → Banish up to three minions from one cemetery to stitch together. This Abomination has
//  their combined power, but each part may be damaged and destroyed separately.'
const partTough = (name: string): number => Math.max(1, getCard(name).defence ?? getCard(name).attack ?? 1)

const liveParts = (state: GameState, unitId: string): { name: string; damage: number }[] =>
  ((state.flow?.abomParts?.[unitId] ?? []) as { name: string; damage: number }[]).filter((p) => p.damage < partTough(p.name))

registerScript('Stitched Abomination', {
  takesDamageInParts: true,
  selfPower: (state, self) => liveParts(state, self.id).reduce((n, p) => n + (getCard(p.name).attack ?? 0), 0),
  genesis: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Stitch from which cemetery?', data: { options: ['your cemetery', "opponent's cemetery"] } }, 'morgue')
  },
  deathrite: (ctx) => {
    if (ctx.state.flow?.abomParts) delete ctx.state.flow.abomParts[ctx.sourceId]
  },
  conts: {
    morgue: (ctx, _c, choice) => {
      const owner = (choice === "opponent's cemetery" ? (ctx.controller === 0 ? 1 : 0) : ctx.controller) as PlayerId
      if (cemeteryProtected(ctx.state, owner, ctx.controller)) {
        return ctx.log('Wormelow Tump seals that cemetery shut — the Abomination stays unstitched.')
      }
      const p = ctx.state.players[owner]
      const minions = p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion')
      if (!minions.length) return ctx.log('That morgue is empty — the Abomination is but empty stitches.')
      if (!payZoneToll(ctx.state, ctx.controller)) {
        return ctx.log('The Bureau of Occult Control demands (2) for cemetery access — the Abomination stays unstitched.')
      }
      ctx.ask(
        { kind: 'chooseCards', title: 'Stitch together which minions (up to three)?', data: { cards: minions.map((id) => ctx.state.cards[id].name), pick: 3, upTo: true } },
        'stitch',
        { owner, minions },
      )
    },
    stitch: (ctx, c, choice) => {
      const idxs = (Array.isArray(choice) ? choice : [choice]).filter((i): i is number => typeof i === 'number')
      const owner = c.owner as PlayerId
      const pool = c.minions as string[]
      const p = ctx.state.players[owner]
      const parts: { name: string; damage: number }[] = []
      for (const i of idxs.slice(0, 3)) {
        const cardId = pool[i]
        if (!cardId || !p.cemetery.includes(cardId)) continue
        p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
        p.banished.push(cardId)
        parts.push({ name: ctx.state.cards[cardId].name, damage: 0 })
      }
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.abomParts = { ...(ctx.state.flow.abomParts ?? {}), [ctx.sourceId]: parts }
      pushLog(ctx.state, ctx.controller, `🧟 The Abomination lurches up, stitched from ${parts.map((x) => x.name).join(', ') || 'nothing at all'}.`)
    },
  },
})

registerCont('abom:part', (state, c: { unitId: string; n: number; sourcePlayer: PlayerId; lethal: boolean }, choice) => {
  const unit = state.units[c.unitId]
  if (!unit) return
  // FAQ: lethal (or outright kill) destroys ALL parts
  if (c.lethal) {
    for (const p of liveParts(state, unit.id)) p.damage = 999
    pushLog(state, null, `${unit.name} comes apart at the seams.`)
    killUnit(state, unit.id)
    return
  }
  const alive = liveParts(state, unit.id)
  const part = alive.find((p) => p.name === choice) ?? alive[0]
  if (!part) return
  // the damage dealer may SPLIT the instance across parts: ask how much goes here
  if (c.n > 1 && alive.length > 1) {
    pushPrompt(state, {
      player: c.sourcePlayer,
      kind: 'chooseOption',
      title: `How much of the ${c.n} damage goes to the ${part.name} part?`,
      data: { options: Array.from({ length: c.n }, (_, i) => String(i + 1)) },
      cont: 'abom:amount',
      ctx: { ...c, partName: part.name },
    })
    return
  }
  applyPartDamage(state, c.unitId, part.name, c.n, c.sourcePlayer)
})

registerCont('abom:amount', (state, c: { unitId: string; n: number; sourcePlayer: PlayerId; partName: string }, choice) => {
  const amount = Math.max(1, Math.min(c.n, Number(choice) || c.n))
  applyPartDamage(state, c.unitId, c.partName, amount, c.sourcePlayer)
  const left = c.n - amount
  const unit = state.units[c.unitId]
  if (left > 0 && unit && liveParts(state, unit.id).length > 0) {
    // keep allocating the remainder
    pushPrompt(state, {
      player: c.sourcePlayer,
      kind: 'chooseOption',
      title: `${unit.name} takes ${left} more — which part is struck?`,
      data: { options: liveParts(state, unit.id).map((p) => p.name) },
      cont: 'abom:part',
      ctx: { unitId: c.unitId, n: left, sourcePlayer: c.sourcePlayer, lethal: false },
    })
  }
})

function applyPartDamage(state: GameState, unitId: string, partName: string, amount: number, by: PlayerId): void {
  const unit = state.units[unitId]
  if (!unit) return
  const alive = liveParts(state, unitId)
  const part = alive.find((p) => p.name === partName) ?? alive[0]
  if (!part) return
  part.damage += amount
  if (part.damage >= partTough(part.name)) {
    pushLog(state, by, `The ${part.name} part of ${unit.name} is destroyed!`)
  } else {
    pushLog(state, by, `${unit.name}'s ${part.name} part takes ${amount}.`)
  }
  if (liveParts(state, unitId).length === 0) {
    pushLog(state, null, `${unit.name} comes apart at the seams.`)
    killUnit(state, unitId)
  }
}
