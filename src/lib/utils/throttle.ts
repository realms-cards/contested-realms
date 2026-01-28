/**
 * Throttle utility for limiting function call frequency.
 * Essential for performance during drag operations where pointermove/mousemove
 * events fire 60+ times per second.
 */

/**
 * Creates a throttled function that only invokes `fn` at most once per `wait` milliseconds.
 * Uses trailing edge - the last call within the throttle window is executed.
 *
 * @param fn - Function to throttle
 * @param wait - Minimum milliseconds between invocations (default: 16ms = ~60fps)
 * @returns Throttled function with a `cancel` method
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  wait = 16,
): T & { cancel: () => void } {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastCallTime);

    lastArgs = args;

    if (remaining <= 0) {
      // Execute immediately
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCallTime = now;
      fn(...args);
    } else if (!timeoutId) {
      // Schedule trailing call
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        timeoutId = null;
        if (lastArgs) {
          fn(...lastArgs);
        }
      }, remaining);
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  return throttled;
}

/**
 * RAF-based throttle - limits to one call per animation frame.
 * Best for visual updates that should sync with display refresh.
 *
 * @param fn - Function to throttle
 * @returns RAF-throttled function with a `cancel` method
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttleRAF<T extends (...args: any[]) => void>(
  fn: T,
): T & { cancel: () => void } {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    lastArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (lastArgs) {
          fn(...lastArgs);
        }
      });
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastArgs = null;
  };

  return throttled;
}
