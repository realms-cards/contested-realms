import { registerScript } from '../registry'
import { fireballHit, impactProjectileScript } from './magic-helpers'

// 'Shoot a projectile. It deals 4 damage on impact, and 2 damage to each other unit at that location.'
registerScript('Fireball', impactProjectileScript('Which unit does the fireball strike for 4?', fireballHit))
