import { startTransition } from 'react';

/**
 * Wraps socket event state updates in React 19's startTransition to mark them as non-urgent.
 * This prevents socket updates from blocking interactive input during concurrent rendering.
 *
 * @param updateFn - Function containing Zustand state updates or other non-urgent work
 *
 * @example
 * ```typescript
 * // Socket handler with React 19 concurrent rendering safety
 * const handler = (data: CursorData) => {
 *   batchSocketUpdate(() => {
 *     setRemoteCursor(data);
 *     setHighlight(data.highlight);
 *   });
 * };
 * ```
 *
 * @see https://react.dev/reference/react/startTransition
 */
export function batchSocketUpdate(updateFn: () => void): void {
  startTransition(() => {
    try {
      updateFn();
    } catch (error) {
      // Log but don't throw - socket updates should be resilient
      console.error('[batchSocketUpdate] Error during state update:', error);
    }
  });
}

/**
 * Type guard to check if a value is a valid socket event payload.
 * Use this to safely parse incoming socket data before state updates.
 */
export function isValidSocketPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
