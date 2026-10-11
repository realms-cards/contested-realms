import { registerScript } from '../registry'

// 'Ward, Airborne while Warded'
registerScript('Zeppelin of Zealots', {
  selfKeywords: (_state, self) => (self.ward ? ['airborne'] : []),
})
