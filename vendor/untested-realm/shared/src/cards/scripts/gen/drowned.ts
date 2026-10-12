import { registerScript } from '../registry'
import type { Region } from '../../../engine/types'

// 'Submerge / Must be cast submerged.'
registerScript('Drowned', {
  mustSummonRegion: 'underwater' as Region,
})
