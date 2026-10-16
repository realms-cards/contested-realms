import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'
import { transformFromHand } from '../multi-card-utils/transform-from-hand'

// '(3) → Transform an ally with Submerge into Slimy Mutants from your hand.'
registerScript('Slimy Mutants', transformFromHand({
  name: 'Slimy Mutants',
  keyPrefix: 'slime',
  label: '③ → A submerging ally mutates into Slimy Mutants',
  cost: { mana: 3 },
  eligible: (state, u) => !!effKeywords(state, u).submerge,
  emptyMsg: 'No submerging ally to mutate.',
  askTitle: 'Which ally sloughs into slime?',
  log: 'Flesh runs like wax — the Slimy Mutants emerge.',
}))
