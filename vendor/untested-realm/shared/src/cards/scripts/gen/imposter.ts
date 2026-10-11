import { registerScript, getScript, type EffectAPI, type AbilityDef } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { avatarOf } from '../../../engine/grid'
import { collectionBanned, payZoneToll, collectionNames, takeFromCollection } from '../../../engine/statics'
import type { GameState, PlayerId } from '../../../engine/types'

const maskNameOf = (state: GameState, player: PlayerId): string | undefined =>
  state.flow?.imposterMask?.[player]

const maskScriptOf = (state: GameState, player: PlayerId) => {
  const n = maskNameOf(state, player)
  return n ? getScript(n) : undefined
}

registerScript('Imposter', {
  abilities: [{
    key: 'imposter:mask',
    label: 'Don a new mask (banish an Avatar from your collection)',
    cost: { mana: 3 },
    effect: (ctx) => {
      // ONLY avatars actually in YOUR collection (name → copies pool), never every
      // avatar in the game. One of them is banished to become the new mask.
      const avatars = collectionNames(ctx.state, ctx.controller)
        .filter((name) => getCard(name).type === 'Avatar' && name !== 'Imposter' && !collectionBanned(ctx.state, ctx.controller, name))
      if (!avatars.length) return ctx.log('No avatar remains in your collection to mask.')
      ctx.ask({ kind: 'chooseCards', title: 'The Imposter wears whose face?', data: { cards: avatars, pick: 1, upTo: false } }, 'imposter:don', { avatars })
    },
  }],
  grantsAbilities: (state, selfId, unit): AbilityDef[] => {
    if (unit.id !== selfId) return []
    const abilities = maskScriptOf(state, unit.controller)?.abilities ?? []
    // A masked Imposter normally does NOT gain an ability that flips its own card (Druid's Bruin):
    // flipping leaves its OWNER with no Avatar → instant loss (FAQ), a pointless self-defeat we don't
    // offer. EXCEPTION — Courtesan Thaïs: while this seat is being PILOTED by the opponent (their
    // controlled turn), the pilot MAY flip it, because the loss falls on the controlled owner, not the
    // pilot. Masking the enemy's Imposter as Druid (from their collection) and flipping it wins the duel.
    const pilotedByOpponent = state.flow?.thaisActive === unit.controller && state.activePlayer === unit.controller
    return pilotedByOpponent ? abilities : abilities.filter((a) => !a.flipsSelf)
  },
  selfKeywords: (state, self) => maskScriptOf(state, self.controller)?.selfKeywords?.(state, self) ?? [],
  // the mask's continuous "modify other units' subtypes" hook must apply too, or a
  // mask like Animist can't tag its animated magics as Spirits while worn.
  subtypeOverride: (state, selfId, unit, st) => {
    const p = state.units[selfId]?.controller
    return p === undefined ? st : maskScriptOf(state, p)?.subtypeOverride?.(state, selfId, unit, st) ?? st
  },
  costModifier: (state, sourceId, caster, cardName) => {
    const self = state.units[sourceId]
    if (!self) return 0
    return maskScriptOf(state, self.controller)?.costModifier?.(state, sourceId, caster, cardName) ?? 0
  },
  // a mask's damage-reduction (Ironclad's "takes 2 less") applies while worn — it reduces
  // the incoming hit BEFORE the mask cracks off, so a 3-damage blow lands as 3-2=1.
  damageReduction: (state, self, victim) =>
    maskScriptOf(state, self.controller)?.damageReduction?.(state, self, victim) ?? 0,
  handSpellMorph: (state, player, cardName) =>
    avatarOf(state, player)?.name === 'Imposter' ? maskScriptOf(state, player)?.handSpellMorph?.(state, player, cardName) ?? null : null,
  afterAvatarSitePlay: (ctx, siteId) => maskScriptOf(ctx.state, ctx.controller)?.afterAvatarSitePlay?.(ctx, siteId),
  startOfTurn: (ctx) => maskScriptOf(ctx.state, ctx.controller)?.startOfTurn?.(ctx),
  endOfTurn: (ctx) => maskScriptOf(ctx.state, ctx.controller)?.endOfTurn?.(ctx),
  onSpellCast: (ctx, by, cardName, casterId, targets) =>
    maskScriptOf(ctx.state, ctx.controller)?.onSpellCast?.(ctx, by, cardName, casterId, targets),
  // "whenever an ally strikes an enemy Avatar" (Interrogator) is a triggered avatar ability, so a
  // masked Imposter must perform it too — from ANY strike source (melee, an effect strike like
  // Quarrelsome Kobolds' end-of-turn brawl, simultaneous strikes): all emit onAllyStrikesAvatar.
  onAllyStrikesAvatar: (ctx, striker, avatar) =>
    maskScriptOf(ctx.state, ctx.controller)?.onAllyStrikesAvatar?.(ctx, striker, avatar),
  onSelfDamaged: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const player = self?.controller ?? ctx.controller
    if (ctx.state.flow?.imposterMask?.[player]) {
      pushLog(ctx.state, player, `The Imposter's mask of ${ctx.state.flow.imposterMask[player]} cracks and falls away.`)
      delete ctx.state.flow.imposterMask[player]
    }
  },
  // continuations of masked abilities resolve through the mask's own script
  conts: new Proxy(
    {
      'imposter:don': (ctx: EffectAPI, c: any, choice: any) => {
        const idx = Array.isArray(choice) ? choice[0] : choice
        if (typeof idx !== 'number') return
        const name = (c.avatars as string[])[idx]
        if (!name) return
        // the avatar must still be in the collection (state may have shifted)
        if (((ctx.state.players[ctx.controller].collection ?? {})[name] ?? 0) <= 0) return
        if (!payZoneToll(ctx.state, ctx.controller)) {
          return pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for collection access.')
        }
        takeFromCollection(ctx.state, ctx.controller, name) // banish the avatar from your collection
        ctx.state.flow = ctx.state.flow ?? {}
        ctx.state.flow.imposterMask = { ...(ctx.state.flow.imposterMask ?? {}), [ctx.controller]: name }
        pushLog(ctx.state, ctx.controller, `🎭 The Imposter banishes ${name} from the collection and dons their face.`)
      },
    } as Record<string, (ctx: EffectAPI, c: any, choice: any) => void>,
    {
      get: (own, key: string) =>
        own[key] ??
        ((ctx: EffectAPI, c: any, choice: any) =>
          maskScriptOf(ctx.state, ctx.controller)?.conts?.[key]?.(ctx, c, choice)),
    },
  ),
})
