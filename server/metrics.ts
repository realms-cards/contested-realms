import type { HotPathMetrics } from "./types";

/**
 * Global metrics for hot path events
 * In production, these would be exported to Prometheus
 */
export const metrics: HotPathMetrics = {
  cursorRecvTotal: 0,
  cursorSentTotal: 0,
  chatRecvTotal: 0,
  chatSentTotal: 0,
  lobbiesUpdatedSentTotal: 0,
  rateLimitHitsTotal: new Map<string, number>(),
};

/**
 * Increments a counter metric
 */
export function incrementMetric(name: keyof Omit<HotPathMetrics, "rateLimitHitsTotal">): void {
  metrics[name]++;
}

/**
 * Increments rate limit hit counter for a specific event type
 */
export function incrementRateLimitHit(eventType: string): void {
  const current = metrics.rateLimitHitsTotal.get(eventType) ?? 0;
  metrics.rateLimitHitsTotal.set(eventType, current + 1);
}

/**
 * Gets all metrics as a plain object (for Prometheus scraping)
 */
export function getMetricsSnapshot(): Record<string, number> {
  const snapshot: Record<string, number> = {
    cursor_recv_total: metrics.cursorRecvTotal,
    cursor_sent_total: metrics.cursorSentTotal,
    chat_recv_total: metrics.chatRecvTotal,
    chat_sent_total: metrics.chatSentTotal,
    lobbies_updated_sent_total: metrics.lobbiesUpdatedSentTotal,
  };

  // Add rate limit metrics
  for (const [type, count] of metrics.rateLimitHitsTotal.entries()) {
    snapshot[`rate_limit_hits_total{type="${type}"}`] = count;
  }

  return snapshot;
}

/**
 * Debug logging helper - only logs if DEBUG_LOGS=1
 */
export function debugLog(message: string, ...args: unknown[]): void {
  if (process.env.DEBUG_LOGS === "1") {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}
