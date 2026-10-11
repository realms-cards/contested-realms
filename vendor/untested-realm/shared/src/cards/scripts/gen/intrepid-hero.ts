import { registerScript } from '../registry'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Lethal to Evil.'
registerScript('Intrepid Hero', {
  lethalVs: (state, _striker, target) => !target.isAvatar && isEvilU(state, target),
})
