/**
 * The rules-engine match service: everything the socket layer needs, with none of socket.io in
 * it, so it can be driven by a test as easily as by a connection.
 *
 * A match here is a second, parallel pipeline — NOT a flag on the legacy one. The legacy path
 * deep-merges patches that clients send and runs with rule enforcement off by default; if it
 * ever touched an engine match the state would be corrupt for both players. So the legacy
 * `action` handler refuses an engine match outright (see `isEngineMatch`), rather than merely
 * ignoring it.
 */
import { EnginePool } from "./pool";

/** Bumped on every applied action. A client that receives an older rev ignores it. */
type Live = { rev: number; over: boolean };

export type EngineSeat = 0 | 1;

export type ViewEnvelope = {
  matchId: string;
  rev: number;
  seat: EngineSeat;
  view: unknown;
  power: Record<string, { atk: number; def: number }>;
  /** Units the engine considers disabled; derived from the full state, so it must be sent. */
  disabled: string[];
  /** Everything this seat may legally do right now — the client cannot work this out itself. */
  legal: unknown[];
  over: boolean;
};

export type ActionOutcome =
  | { ok: true; rev: number; over: boolean; winner: EngineSeat | null; draw: boolean }
  | { ok: false; reason: string; rev: number };

export class EngineMatchService {
  private readonly live = new Map<string, Live>();

  constructor(private readonly pool: EnginePool = new EnginePool()) {}

  isEngineMatch(matchId: string): boolean {
    return this.live.has(matchId);
  }

  revOf(matchId: string): number {
    return this.live.get(matchId)?.rev ?? 0;
  }

  async start(
    matchId: string,
    decks: [unknown, unknown],
    names: [string, string],
    seed: number,
    first: EngineSeat,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const reply = await this.pool.create(matchId, decks, names, seed, first);
    if (!reply.ok) return { ok: false, reason: reply.error };
    this.live.set(matchId, { rev: 0, over: false });
    return { ok: true };
  }

  /**
   * Put a seat's action to the engine.
   *
   * `expectedRev` lets a client say which picture it decided on. A mismatch is refused rather
   * than applied, because the board the player clicked is not the board the server has — the
   * refusal carries the real rev so the client can catch up instead of guessing.
   */
  async act(matchId: string, seat: EngineSeat, action: unknown, expectedRev?: number): Promise<ActionOutcome> {
    const live = this.live.get(matchId);
    if (!live) return { ok: false, reason: "That match is not a rules-engine match.", rev: 0 };
    if (live.over) return { ok: false, reason: "The game is already over.", rev: live.rev };
    if (expectedRev !== undefined && expectedRev !== live.rev) {
      return { ok: false, reason: "Your board was out of date; it has been refreshed.", rev: live.rev };
    }
    const reply = await this.pool.act(matchId, seat, action);
    if (!reply.ok) return { ok: false, reason: reply.error, rev: live.rev };
    if (reply.kind !== "act") return { ok: false, reason: "Unexpected reply from the engine.", rev: live.rev };
    live.rev += 1;
    live.over = reply.over;
    return { ok: true, rev: live.rev, over: reply.over, winner: reply.winner, draw: reply.draw };
  }

  /** What one seat is allowed to see. The only thing that may ever reach a client. */
  async viewFor(matchId: string, seat: EngineSeat): Promise<ViewEnvelope | null> {
    const live = this.live.get(matchId);
    if (!live) return null;
    const reply = await this.pool.view(matchId, seat);
    if (!reply.ok || reply.kind !== "view") return null;
    return { matchId, rev: live.rev, seat, view: reply.view, power: reply.power, disabled: reply.disabled, legal: reply.legal, over: live.over };
  }

  /** The full state, for persisting across a restart. Never goes to a client. */
  async snapshot(matchId: string): Promise<unknown | null> {
    const reply = await this.pool.snapshot(matchId);
    return reply.ok && reply.kind === "snapshot" ? reply.state : null;
  }

  /**
   * Bring a persisted match back after a restart.
   *
   * `rev` is carried over so a client that reconnects with an older picture is still told to
   * refresh rather than silently accepted.
   */
  async restore(matchId: string, state: unknown, rev: number, over: boolean): Promise<boolean> {
    const reply = await this.pool.restore(matchId, state);
    if (!reply.ok) return false;
    this.live.set(matchId, { rev, over });
    return true;
  }

  async end(matchId: string): Promise<void> {
    this.live.delete(matchId);
    await this.pool.drop(matchId);
  }

  shutdown(): void {
    this.live.clear();
    this.pool.shutdown();
  }
}
