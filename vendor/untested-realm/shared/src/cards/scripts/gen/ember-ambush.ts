import { registerScript } from '../registry'

// EXAMPLE site trap — the reference implementation for the Frostmage-vs-Lavamancer expansion's trap
// mechanic (see engine/traps.ts). A Fire trap: played FACE-DOWN, disguised as a Wasteland (its element's
// basic site) so the opponent only ever sees a Wasteland + a trap badge. Springing it (2 mana) reveals
// the real site and blasts a nearby enemy; the site then stays in play as Ember Ambush.
registerScript('Ember Ambush', {
  siteTrap: true,
  siteTrapAbility: {
    label: 'Spring the trap: 3 damage to target nearby enemy',
    cost: { mana: 2 },
    targets: [{ what: 'unit', count: 1, targeted: true, where: 'nearby', owner: 'enemy', label: 'target nearby enemy' }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (t && 'unit' in t) ctx.dealDamage({ unit: t.unit }, 3)
    },
  },
})
