import { registerScript } from '../registry'

// "Can't be moved, destroyed, or modified."
registerScript('Bedrock', {
  indestructibleSite: true,
  immovableSite: true,
  unmodifiableSite: true,
})
