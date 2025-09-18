'use client'

import { useEffect } from 'react'

/**
 * Suppress noisy OpenType warnings from troika/opentype.js in development.
 * These appear as:
 *  - "unsupported GPOS table LookupType ..."
 *  - "unsupported GSUB table LookupType ..."
 * They are harmless for Latin scripts but clutter the console.
 */
export default function ConsoleWarningFilter() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const originalWarn = console.warn.bind(console)
    console.warn = (...args: unknown[]) => {
      const first = String(args[0] ?? '')
      if (
        first.includes('unsupported GPOS table') ||
        first.includes('unsupported GSUB table')
      ) {
        return
      }
      originalWarn(...args as Parameters<typeof console.warn>)
    }
    return () => {
      console.warn = originalWarn
    }
  }, [])

  return null
}

