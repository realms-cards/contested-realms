import { registerScript } from '../registry'

// "Stealth / Can't be immobilized or disabled." — two distinct immunities, each flagged explicitly.
registerScript('Gossamer Ghost', { immuneToDisable: true, immuneToImmobilize: true })
