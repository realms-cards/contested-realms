import { beforeEach, describe, expect, it } from "vitest";
import {
  createGameStore,
  type CellKey,
  type GameState,
  type PermanentItem,
  type PlayerKey,
  type Thresholds,
} from "@/lib/game/store";

const zeroThresholds = (): Thresholds => ({
  air: 0,
  water: 0,
  earth: 0,
  fire: 0,
});

const makePermanent = (
  cardId: number,
  name: string,
  owner: 1 | 2,
  extras: Partial<PermanentItem> = {}
): PermanentItem =>
  ({
    owner,
    card: {
      cardId,
      name,
      type: "Unit",
      variantId: null,
    },
    tapped: false,
    tilt: 0,
    version: 0,
    tapVersion: 0,
    offset: null,
    ...extras,
  } as PermanentItem);

describe("combat state", () => {
  let store: ReturnType<typeof createGameStore>;

  beforeEach(() => {
    store = createGameStore();
    // Avoid accidental network traffic from tests
    store.setState({ transport: null } as Partial<GameState>);
  });

  describe("setDamageAssignment", () => {
    const attackerKey = "1,1";
    const defenderKey = "1,2";

    beforeEach(() => {
      store.setState({
        metaByCardId: {
          101: { attack: 4, defence: 2, cost: null },
          202: { attack: 1, defence: 3, cost: null },
        },
        permanents: {
          [attackerKey]: [makePermanent(101, "Attacker", 1)],
          [defenderKey]: [makePermanent(202, "Defender", 2)],
        },
        pendingCombat: {
          id: "cmb_test",
          tile: { x: 1, y: 1 },
          attacker: { at: attackerKey as CellKey, index: 0, owner: 1 },
          target: null,
          defenderSeat: "p2" as PlayerKey,
          defenders: [{ at: defenderKey as CellKey, index: 0, owner: 2 }],
          status: "committed",
          assignment: null,
          createdAt: Date.now(),
        },
      } as Partial<GameState>);
    });

    it("rejects assignments whose total does not match attacker power", () => {
      const result = store
        .getState()
        .setDamageAssignment([{ at: defenderKey as CellKey, index: 0, amount: 3 }]);

      expect(result).toBe(false);
      expect(store.getState().pendingCombat?.assignment).toBeNull();
    });

    it("normalizes valid assignments and stores them on pending combat", () => {
      const ok = store
        .getState()
        .setDamageAssignment([{ at: defenderKey as CellKey, index: 0, amount: 4 }]);
      expect(ok).toBe(true);

      const assignment = store.getState().pendingCombat?.assignment;
      expect(assignment).toEqual([{ at: defenderKey as CellKey, index: 0, amount: 4 }]);
    });
  });

  describe("autoResolveCombat", () => {
    it("applies avatar damage, clears pending combat, and records a summary", () => {
      const attackerKey = "0,0";
      store.setState({
        actorKey: "p1",
        board: { size: { w: 5, h: 4 }, sites: {} },
        metaByCardId: { 500: { attack: 4, defence: 2, cost: null } },
        permanents: {
          [attackerKey]: [makePermanent(500, "Skirmisher", 1)],
        },
        players: {
          p1: { life: 20, lifeState: "alive", mana: 0, thresholds: zeroThresholds() },
          p2: { life: 12, lifeState: "alive", mana: 0, thresholds: zeroThresholds() },
        },
        pendingCombat: {
          id: "cmb_avatar",
          tile: { x: 0, y: 0 },
          attacker: { at: attackerKey as CellKey, index: 0, owner: 1 },
          target: { kind: "avatar", at: "avatar_tile" as CellKey, index: null },
          defenderSeat: "p2" as PlayerKey,
          defenders: [],
          status: "committed",
          assignment: null,
          createdAt: Date.now(),
        },
      } as Partial<GameState>);

      store.getState().autoResolveCombat();

      const state = store.getState();
      expect(state.players.p2.life).toBe(8);
      expect(state.pendingCombat).toBeNull();
      expect(state.lastCombatSummary).not.toBeNull();
      expect(state.lastCombatSummary?.id).toBe("cmb_avatar");
    });
  });
});
