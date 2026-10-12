import { registerScript } from '../registry'

// ------------------------------------------------------------ Wormelow Tump ----
// '(E)(E)(E) – Opponents can't affect cards in your cemetery.'
// Enforced by cemeteryProtected() (statics), consulted at every effect that
// reaches into an enemy cemetery: Feast for Crows, Grim Reaper, Blunderbore,
// Skeleton Mage, Return to Nature, Flame of the First Ones, The Pallid Bust,
// Stitched Abomination, and Kairos's restore.
registerScript('Wormelow Tump', {})
