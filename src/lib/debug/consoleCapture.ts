/**
 * Console log capture utility for bug reports.
 * Intercepts console methods and stores recent logs in a circular buffer.
 */

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface CapturedLog {
  level: LogLevel;
  timestamp: number;
  message: string;
  args: string[];
}

const MAX_LOGS = 200;
const capturedLogs: CapturedLog[] = [];
let isCapturing = false;

// Store original console methods
const originalConsole: Record<LogLevel, typeof console.log> = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

function formatArg(arg: unknown): string {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
  }
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function createInterceptor(level: LogLevel) {
  return function (...args: unknown[]) {
    // Always call original
    originalConsole[level].apply(console, args);

    if (!isCapturing) return;

    const log: CapturedLog = {
      level,
      timestamp: Date.now(),
      message: args.map(formatArg).join(" "),
      args: args.map(formatArg),
    };

    capturedLogs.push(log);

    // Keep buffer size limited
    while (capturedLogs.length > MAX_LOGS) {
      capturedLogs.shift();
    }
  };
}

/**
 * Start capturing console logs
 */
export function startCapture(): void {
  if (isCapturing) return;
  isCapturing = true;

  console.log = createInterceptor("log");
  console.info = createInterceptor("info");
  console.warn = createInterceptor("warn");
  console.error = createInterceptor("error");
  console.debug = createInterceptor("debug");
}

/**
 * Stop capturing console logs and restore original methods
 */
export function stopCapture(): void {
  if (!isCapturing) return;
  isCapturing = false;

  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
}

/**
 * Get all captured logs
 */
export function getCapturedLogs(): CapturedLog[] {
  return [...capturedLogs];
}

/**
 * Get captured logs as formatted string for bug reports
 */
export function getLogsAsText(): string {
  return capturedLogs
    .map((log) => {
      const time = new Date(log.timestamp).toISOString();
      const levelStr = `[${log.level.toUpperCase()}]`.padEnd(7);
      return `${time} ${levelStr} ${log.message}`;
    })
    .join("\n");
}

/**
 * Clear all captured logs
 */
export function clearCapturedLogs(): void {
  capturedLogs.length = 0;
}

/**
 * Check if capture is active
 */
export function isCapturingActive(): boolean {
  return isCapturing;
}

// Auto-start capture in browser environment
if (typeof window !== "undefined") {
  startCapture();
}
