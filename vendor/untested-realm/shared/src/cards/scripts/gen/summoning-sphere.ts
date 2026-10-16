import { registerScript } from '../registry'
import { summonPermissionAura } from '../multi-card-utils/summon-permission-aura'

// 'You may summon minions to affected sites.' — ANY minion onto a site the Sphere covers (no element /
// subtype filter, no power bonus). Shares summonPermissionAura with Crusade / Jihad / Eclipse / Evil
// Presence. (Bug fixed: it used to ignore the target square and grant summon-anywhere.)
registerScript('Summoning Sphere', summonPermissionAura({}))
