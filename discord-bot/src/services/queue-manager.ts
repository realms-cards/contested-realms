/**
 * Manages the matchmaking queue for constructed matches.
 * Uses Redis for persistent queue state with in-memory fallback.
 *
 * Matching priority:
 *  1. Same-guild pair — matched immediately on join
 *  2. Any same-guild pair in the full queue
 *  3. Cross-server fallback after CROSS_SERVER_GRACE_MS (2 min)
 */

export { QueueManager } from "./shared-queue-manager.js";
export type { JoinQueueResult } from "./shared-queue-manager.js";
