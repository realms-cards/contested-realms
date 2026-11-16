import { registerScript, type DamageSource, type EffectAPI } from '../registry'
import { siteAt } from '../../../engine/grid'
import { dealDamage } from '../../../engine/effects'
import { effDefence, effKeywords } from '../../../engine/statics'

// 'While attacking, the Mammoth's excess damage is dealt to its site.'
// "Excess damage" isn't a Codex term; read literally: whatever part of a strike the Mammoth makes as the
// attacker goes beyond what the struck unit had left — a minion's remaining life (power minus damage
// already taken), an Avatar's remaining life — is then dealt to the site the Mammoth stands on (its
// controller loses that much life). It's worked out from the damage actually dealt, after modifiers and
// prevention, one struck unit at a time. FAQ: with several defenders the Mammoth must assign each of them
// damage until they would die before any is excess (lethalFirstWhileAttacking — the engine normalizes the
// split); excess goes to the Mammoth's own site even when that's its controller's (FAQ: 'it is the grass
// that suffers'). Not while defending, intercepting or in a plain fight; an undefended strike on a site is
// all site damage already.
const mineAttacking = (ctx: EffectAPI, source: DamageSource) =>
  source.kind === 'strike' && !!source.attacking && source.attackerId === ctx.sourceId

function stomp(ctx: EffectAPI, excess: number): void {
  const m = ctx.state.units[ctx.sourceId]
  if (!m || excess <= 0) return
  const site = siteAt(ctx.state, m.x, m.y)
  if (!site) return
  ctx.log(`${m.name} stomps on — ${excess} excess damage crashes into ${site.name}.`)
  // the Mammoth's ability moves the rest onto its site: not a fresh strike (strike-damage modifiers already
  // shaped the blow, and a site-strike consumer mustn't see a second strike), and no `attacking` tag
  dealDamage(ctx.state, { site: site.id }, excess, ctx.controller, { player: ctx.controller, kind: 'ability', sourceUnitId: m.id, name: m.name })
}

registerScript('Stomping Mammoth', {
  lethalFirstWhileAttacking: true,
  // an Avatar's life before the blow (it bottoms out at 0, so the excess can't be read off afterwards) —
  // noted only while the Mammoth is the attacker, in the battle's scratch space (cleared as the battle ends)
  onStrike: (ctx, target) => {
    if (!target.isAvatar || ctx.state.flow?.attackingUnitId !== ctx.sourceId) return
    const scratch = (ctx.state.flow.battleScratch ??= {})
    scratch.mammothAvatarLife = { ...(scratch.mammothAvatarLife ?? {}), [ctx.sourceId]: { player: target.controller, life: target.life ?? 0 } }
  },
  onUnitDamaged: (ctx, victim, amount, source) => {
    if (!mineAttacking(ctx, source) || victim.isAvatar) return
    const live = ctx.state.units[victim.id] ?? victim
    const m = ctx.state.units[ctx.sourceId]
    let before = Math.max(0, effDefence(ctx.state, live) - (victim.damage - amount))
    if (m && effKeywords(ctx.state, m).lethal) before = Math.min(1, before) // with Lethal, 1 damage kills
    stomp(ctx, amount - before)
  },
  onLifeLost: (ctx, player, amount, source) => {
    if (!source || !mineAttacking(ctx, source)) return
    const notes = ctx.state.flow?.battleScratch?.mammothAvatarLife
    const stash = notes?.[ctx.sourceId] as { player: number; life: number } | undefined
    if (!stash || stash.player !== player) return
    delete notes[ctx.sourceId]
    stomp(ctx, amount - stash.life)
  },
})
