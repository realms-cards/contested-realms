import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'
import { transformFromHand } from '../multi-card-utils/transform-from-hand'

// '(A)(W) — Reveal from hand → Transform an allied Mortal into Sir Gareth.'
registerScript('Sir Gareth', transformFromHand({
  name: 'Sir Gareth',
  keyPrefix: 'gareth',
  label: 'Reveal → a Mortal ally becomes Sir Gareth',
  cost: {},
  threshold: { air: 1, water: 1 },
  eligible: (state, u) => effSubtypes(state, u).includes('Mortal'),
  emptyMsg: 'No allied Mortal to unmask.',
  askTitle: 'Which Mortal was Gareth in disguise?',
  log: 'The humble servant throws off his rags — Sir Gareth stands revealed!',
}))
