import { describe, it, expect } from "vitest";
import type { GameState } from "@/lib/game/store";
import { evaluateInstantPermission, expireInteractionGrant } from "@/lib/game/store/gameActions/helpers";

const baseState = (): GameState => ({
  transport: { sendMessage: () => {} },
  interactionLog: {},
  localPlayerId: null,
} as unknown as GameState);

describe("gameActions helpers", () => {
  it("returns false when no approved instant grants", () => {
    const state = baseState();
    const result = evaluateInstantPermission(state, "p1");
    expect(result).toEqual({ allow: false, consumeId: null });
  });

  it("allows instant play when approved grant exists", () => {
    const state = baseState();
    state.localPlayerId = "me";
    state.interactionLog = ({
      grant1: {
        request: { kind: "instantSpell" },
        status: "approved",
        grant: { grantedTo: "me", singleUse: true },
        direction: "outbound",
      },
    } as unknown) as GameState["interactionLog"];
    const result = evaluateInstantPermission(state, "p1");
    expect(result.allow).toBe(true);
    expect(result.consumeId).toBe("grant1");
  });

  it("expires single-use grant entries", () => {
    const state = baseState();
    state.interactionLog = ({
      grant1: {
        request: { kind: "instantSpell" },
        status: "approved",
        grant: { grantedTo: "me", singleUse: true },
        direction: "outbound",
        updatedAt: 0,
      },
    } as unknown) as GameState["interactionLog"];
    const updated = expireInteractionGrant(state, "grant1");
    expect(updated?.grant1.status).toBe("expired");
  });
});
