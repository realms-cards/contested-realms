"use client";

/**
 * Cross-tab socket leader election.
 *
 * Guarantees that only ONE browser tab (the "leader") holds the Socket.IO connection
 * for a given browser/user. Other tabs stay in standby and never open a socket, which
 * eliminates the server-side per-user dedup churn that previously caused reconnection
 * wars between tabs.
 *
 * Mechanism:
 *  - A heartbeat record in localStorage: { tabId, ts }. The leader refreshes it on an
 *    interval. If the leader tab is closed/crashes, the heartbeat goes stale and a
 *    standby tab claims leadership.
 *  - A BroadcastChannel provides instant notifications (claim/heartbeat/resign) so
 *    handoff is near-immediate; the localStorage `storage` event is the fallback for
 *    browsers without BroadcastChannel.
 *  - Tabs may explicitly take over via requestLeadership() (e.g. user clicks
 *    "Play here"); the current leader yields immediately.
 *
 * This is intentionally a per-tab singleton with a lifetime independent of any socket
 * connect/disconnect cycle. It resigns leadership on page unload.
 */

const STORAGE_KEY = "sorcery:socketLeader";
const CHANNEL_NAME = "sorcery:socketLeader";
const HEARTBEAT_INTERVAL_MS = 2000;
// Leader is considered dead if its heartbeat hasn't refreshed within this window.
const LEADER_TIMEOUT_MS = 6000;
// Delay before confirming a claim won, to let concurrent claims settle (race window).
const CLAIM_CONFIRM_MS = 200;

interface LeaderRecord {
  tabId: string;
  ts: number;
}

type Listener = (isLeader: boolean) => void;

function readRecord(): LeaderRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as LeaderRecord;
    if (typeof rec?.tabId === "string" && typeof rec?.ts === "number") {
      return rec;
    }
  } catch {}
  return null;
}

function writeRecord(rec: LeaderRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {}
}

function isStale(rec: LeaderRecord | null, now = Date.now()): boolean {
  return !rec || now - rec.ts > LEADER_TIMEOUT_MS;
}

interface LeaderMessage {
  type: "claim" | "heartbeat" | "resign";
  tabId: string;
}

class SocketLeaderElection {
  private tabId =
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  private leader = false;
  private started = false;
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private claimTimer: ReturnType<typeof setTimeout> | null = null;

  isLeader(): boolean {
    return this.leader;
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    try {
      this.channel =
        "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    } catch {
      this.channel = null;
    }
    if (this.channel) {
      this.channel.onmessage = (e: MessageEvent) =>
        this.onMessage(e.data as LeaderMessage | null);
    }

    window.addEventListener("storage", this.onStorage);
    window.addEventListener("pagehide", this.onUnload);
    window.addEventListener("beforeunload", this.onUnload);

    this.pollTimer = setInterval(() => this.evaluate(), HEARTBEAT_INTERVAL_MS);
    this.evaluate();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.leader) this.resign();
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
    window.removeEventListener("storage", this.onStorage);
    window.removeEventListener("pagehide", this.onUnload);
    window.removeEventListener("beforeunload", this.onUnload);
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.claimTimer) {
      clearTimeout(this.claimTimer);
      this.claimTimer = null;
    }
  }

  /** Explicitly take leadership from another tab (e.g. user clicked "Play here"). */
  requestLeadership(): void {
    if (!this.started || this.leader) return;
    this.claim();
  }

  private onStorage = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    this.evaluate();
  };

  private onUnload = (): void => {
    if (this.leader) this.resign();
  };

  private onMessage(msg: LeaderMessage | null): void {
    if (!msg || typeof msg.type !== "string" || msg.tabId === this.tabId) return;
    if (msg.type === "claim") {
      // Another tab is taking over (explicit takeover or claiming a dead leader).
      // Yield immediately so its claim sticks without racing our heartbeat.
      if (this.leader) this.stepDown();
    } else if (msg.type === "heartbeat") {
      if (this.leader) this.evaluate();
    } else if (msg.type === "resign") {
      if (!this.leader) this.evaluate();
    }
  }

  private evaluate(): void {
    if (!this.started) return;
    const rec = readRecord();
    const now = Date.now();
    if (this.leader) {
      // We think we're leader: if another live tab overtook the record, step down.
      if (rec && rec.tabId !== this.tabId && !isStale(rec, now)) {
        this.stepDown();
      }
      return;
    }
    // Follower: claim if there is no live leader.
    if (isStale(rec, now)) {
      this.claim();
    }
  }

  private claim(): void {
    const ts = Date.now();
    writeRecord({ tabId: this.tabId, ts });
    this.broadcast("claim");
    if (this.claimTimer) clearTimeout(this.claimTimer);
    this.claimTimer = setTimeout(() => {
      this.claimTimer = null;
      const rec = readRecord();
      if (rec && rec.tabId === this.tabId) {
        this.becomeLeader();
      } else if (isStale(rec)) {
        // Record vanished/went stale again - retry once.
        this.claim();
      }
      // Otherwise another tab owns it: remain a follower.
    }, CLAIM_CONFIRM_MS);
  }

  private becomeLeader(): void {
    if (this.leader) return;
    this.leader = true;
    writeRecord({ tabId: this.tabId, ts: Date.now() });
    this.broadcast("heartbeat");
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.leader) return;
      writeRecord({ tabId: this.tabId, ts: Date.now() });
      this.broadcast("heartbeat");
    }, HEARTBEAT_INTERVAL_MS);
    this.emit();
  }

  private stepDown(): void {
    if (!this.leader) return;
    this.leader = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.emit();
  }

  private resign(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const rec = readRecord();
    if (rec && rec.tabId === this.tabId) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    this.broadcast("resign");
    this.leader = false;
  }

  private broadcast(type: LeaderMessage["type"]): void {
    try {
      this.channel?.postMessage({ type, tabId: this.tabId });
    } catch {}
  }

  private emit(): void {
    for (const l of Array.from(this.listeners)) {
      try {
        l(this.leader);
      } catch {}
    }
  }
}

let singleton: SocketLeaderElection | null = null;

export function getSocketLeader(): SocketLeaderElection {
  if (!singleton) singleton = new SocketLeaderElection();
  return singleton;
}

export type { SocketLeaderElection };
