import { registerScript, type EffectAPI } from '../registry'
import { killUnit, checkStateBased, opponent, toCemetery } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Sacrifice up to one minion, artifact, and aura. Your opponent must sacrifice the same.'
registerScript('Symmetric Suffering', {
  onCast: (ctx) => sufferNext(ctx, ctx.controller, { minion: false, artifact: false, aura: false }, []),
  conts: {
    pickMinion: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const kinds = c.kinds as string[]
      if (typeof id === 'string' && ctx.state.units[id]) {
        // mark this as a SACRIFICE so "can't be destroyed" minions (The Doom of Dilmun) still die
        ctx.state.flow = ctx.state.flow ?? {}
        const prevSac = ctx.state.flow.sacrificing
        ctx.state.flow.sacrificing = id
        killUnit(ctx.state, id)
        ctx.state.flow.sacrificing = prevSac
        checkStateBased(ctx.state)
        kinds.push('minion')
      }
      sufferNext(ctx, c.who as PlayerId, { ...(c.done as any), minion: true }, kinds)
    },
    pickArtifact: (ctx, c, choice) => {
      if (typeof choice === 'string' && ctx.state.artifacts[choice]) {
        ;(c.kinds as string[]).push('artifact')
        ctx.breakArtifact(choice)
      }
      sufferNext(ctx, c.who as PlayerId, { ...(c.done as any), artifact: true }, c.kinds as string[])
    },
    pickAura: (ctx, c, choice) => {
      if (typeof choice === 'string' && choice !== '(none)') {
        const aura = Object.values(ctx.state.auras).find((r) => r.controller === (c.who as PlayerId) && r.name === choice)
        if (aura) {
          const card = ctx.state.cards[aura.cardId]
          if (card) toCemetery(ctx.state, card.id)
          delete ctx.state.auras[aura.id]
          ;(c.kinds as string[]).push('aura')
        }
      }
      sufferNext(ctx, c.who as PlayerId, { ...(c.done as any), aura: true }, c.kinds as string[])
    },
  },
})

function sufferNext(ctx: EffectAPI, who: PlayerId, done: { minion: boolean; artifact: boolean; aura: boolean }, kinds: string[]): void {
  const state = ctx.state
  if (!done.minion) {
    const mine = Object.values(state.units).filter((u) => u.controller === who && !u.isAvatar).map((u) => u.id)
    if (mine.length && (who === ctx.controller || kinds.includes('minion'))) {
      ctx.ask({ kind: 'chooseTargets', title: `${state.players[who].name}: sacrifice which minion?${who === ctx.controller ? ' (optional)' : ''}`, data: { candidates: mine, count: 1, upTo: who === ctx.controller, kind: 'unit' }, player: who }, 'pickMinion', { who, done, kinds })
      return
    }
    done = { ...done, minion: true }
  }
  if (!done.artifact) {
    const mine = Object.values(state.artifacts).filter((a) => (a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy) === who)
    if (mine.length && (who === ctx.controller || kinds.includes('artifact'))) {
      ctx.ask({ kind: 'chooseOption', title: `${state.players[who].name}: sacrifice which artifact?`, data: { options: [...mine.map((a) => a.id), ...(who === ctx.controller ? ['(none)'] : [])] }, player: who }, 'pickArtifact', { who, done, kinds })
      return
    }
    done = { ...done, artifact: true }
  }
  if (!done.aura) {
    const mine = Object.values(state.auras).filter((r) => r.controller === who)
    if (mine.length && (who === ctx.controller || kinds.includes('aura'))) {
      ctx.ask({ kind: 'chooseOption', title: `${state.players[who].name}: sacrifice which aura?`, data: { options: [...mine.map((r) => r.name), ...(who === ctx.controller ? ['(none)'] : [])] }, player: who }, 'pickAura', { who, done, kinds })
      return
    }
    done = { ...done, aura: true }
  }
  if (who === ctx.controller) {
    // now the opponent must match what was sacrificed
    sufferNext(ctx, opponent(ctx.controller), { minion: !kinds.includes('minion'), artifact: !kinds.includes('artifact'), aura: !kinds.includes('aura') }, kinds)
  }
}
