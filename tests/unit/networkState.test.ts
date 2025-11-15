import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createGameStore,
  type GameState,
  type ServerPatchT,
} from "@/lib/game/store";

const makeSnapshot = (
  overrides: Partial<GameState["snapshots"][number]> = {}
): GameState["snapshots"][number] => ({
  id: overrides.id ?? `snap_${Math.random().toString(36).slice(2)}`,
  title: overrides.title ?? "Snapshot",
  ts: overrides.ts ?? Date.now(),
  includePrivate: overrides.includePrivate ?? false,
  kind: overrides.kind ?? "manual",
  turn: overrides.turn ?? 1,
  actor: overrides.actor ?? null,
  payload: overrides.payload ?? ({} as ServerPatchT),
});

describe("networkState", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("prunes pending patches overlapping replace keys and clears snapshots", () => {
    const store = createGameStore();
    const patchA: ServerPatchT = {
      __replaceKeys: ["permanents"],
      permanents: { "0,0": [] },
    } as ServerPatchT;
    const patchB: ServerPatchT = {
      __replaceKeys: ["zones"],
      zones: {
        p1: { hand: [], spellbook: [], atlas: [], graveyard: [], battlefield: [], banished: [] },
        p2: { hand: [], spellbook: [], atlas: [], graveyard: [], battlefield: [], banished: [] },
      },
    } as ServerPatchT;

    store.setState({
      pendingPatches: [patchA, patchB],
      snapshots: [makeSnapshot({ payload: patchA })],
    } as Partial<GameState>);

    store.getState().applyServerPatch(
      {
        __replaceKeys: ["permanents"],
        permanents: { "0,0": [] },
      },
      Date.now()
    );

    const { pendingPatches, snapshots } = store.getState();
    expect(pendingPatches).toHaveLength(1);
    expect(pendingPatches?.[0]).toBe(patchB);
    expect(snapshots).toHaveLength(0);
  });

  it("schedules one auto snapshot when entering Start for a new turn", () => {
    const store = createGameStore();
    vi.useFakeTimers();
    const snapshotSpy = vi.fn();

    store.setState({
      phase: "Main",
      turn: 2,
      currentPlayer: 1,
      snapshots: [],
      createSnapshot: (title: string, kind: "auto" | "manual" = "manual") => {
        snapshotSpy(title, kind);
        store.setState((prev) => ({
          snapshots: [
            ...((prev as GameState).snapshots || []),
            {
              id: `snap_${Date.now()}`,
              title,
              ts: Date.now(),
              includePrivate: false,
              kind,
              turn: (prev as GameState).turn,
              actor: (prev as GameState).currentPlayer,
              payload: {} as ServerPatchT,
            },
          ],
        }) as Partial<GameState>);
      },
    } as Partial<GameState>);

    store.getState().applyServerPatch(
      { phase: "Start", turn: 2, currentPlayer: 1 },
      Date.now()
    );
    vi.runAllTimers();
    expect(snapshotSpy).toHaveBeenCalledWith("Turn 2 start (P1)", "auto");

    snapshotSpy.mockClear();
    store.getState().applyServerPatch(
      { phase: "Start", turn: 2, currentPlayer: 1 },
      Date.now() + 1
    );
    vi.runAllTimers();
    expect(snapshotSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
