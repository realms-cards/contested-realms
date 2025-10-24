export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  return {
    info: (...args: unknown[]) => {
      try {
        console.log(prefix, ...args);
      } catch {
        // noop
      }
    },
    warn: (...args: unknown[]) => {
      try {
        console.warn(prefix, ...args);
      } catch {
        // noop
      }
    },
    error: (...args: unknown[]) => {
      try {
        console.error(prefix, ...args);
      } catch {
        // noop
      }
    },
  };
}
