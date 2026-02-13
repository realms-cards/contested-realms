import { describe, it, expect } from "vitest";
import type {
  PendingInquisition,
  InquisitionPhase,
} from "../src/lib/game/store/types";

describe("The Inquisition resolver types", () => {
  it("should define valid InquisitionPhase values", () => {
    const phases: InquisitionPhase[] = [
      "revealing",
      "selecting",
      "resolving",
      "complete",
    ];
    expect(phases).toHaveLength(4);
    expect(phases).toContain("revealing");
    expect(phases).toContain("selecting");
  });

  it("should construct a valid PendingInquisition", () => {
    const pending: PendingInquisition = {
      id: "inq_test123",
      minion: {
        at: "3,2" as `${number},${number}`,
        index: 0,
        instanceId: "inst_abc",
        owner: 1,
        card: {
          cardId: 999,
          name: "The Inquisition",
          slug: "gothic/the_inquisition",
        } as PendingInquisition["minion"]["card"],
      },
      casterSeat: "p1",
      phase: "revealing",
      victimSeat: "p2",
      revealedHand: [
        {
          cardId: 100,
          name: "Fire Bolt",
          slug: "beta/fire_bolt",
        } as PendingInquisition["minion"]["card"],
        {
          cardId: 101,
          name: "Mountain",
          slug: "beta/mountain",
        } as PendingInquisition["minion"]["card"],
      ],
      selectedCardIndex: null,
      createdAt: Date.now(),
    };

    expect(pending.id).toBe("inq_test123");
    expect(pending.casterSeat).toBe("p1");
    expect(pending.victimSeat).toBe("p2");
    expect(pending.phase).toBe("revealing");
    expect(pending.revealedHand).toHaveLength(2);
    expect(pending.selectedCardIndex).toBeNull();
  });

  it("should allow selecting a card index", () => {
    const pending: PendingInquisition = {
      id: "inq_test456",
      minion: {
        at: "3,2" as `${number},${number}`,
        index: 0,
        instanceId: null,
        owner: 1,
        card: {
          cardId: 999,
          name: "The Inquisition",
          slug: "gothic/the_inquisition",
        } as PendingInquisition["minion"]["card"],
      },
      casterSeat: "p1",
      phase: "selecting",
      victimSeat: "p2",
      revealedHand: [
        {
          cardId: 100,
          name: "Fire Bolt",
          slug: "beta/fire_bolt",
        } as PendingInquisition["minion"]["card"],
        {
          cardId: 101,
          name: "Mountain",
          slug: "beta/mountain",
        } as PendingInquisition["minion"]["card"],
      ],
      selectedCardIndex: 1,
      createdAt: Date.now(),
    };

    expect(pending.phase).toBe("selecting");
    expect(pending.selectedCardIndex).toBe(1);
    expect(pending.revealedHand[pending.selectedCardIndex].name).toBe(
      "Mountain",
    );
  });

  it("should support skip (no card selected for banish)", () => {
    const pending: PendingInquisition = {
      id: "inq_skip",
      minion: {
        at: "1,1" as `${number},${number}`,
        index: 0,
        instanceId: null,
        owner: 2,
        card: {
          cardId: 999,
          name: "The Inquisition",
          slug: "gothic/the_inquisition",
        } as PendingInquisition["minion"]["card"],
      },
      casterSeat: "p2",
      phase: "selecting",
      victimSeat: "p1",
      revealedHand: [
        {
          cardId: 200,
          name: "Browse",
          slug: "beta/browse",
        } as PendingInquisition["minion"]["card"],
      ],
      selectedCardIndex: null,
      createdAt: Date.now(),
    };

    // "May" banish → selectedCardIndex stays null when skipping
    expect(pending.selectedCardIndex).toBeNull();
  });
});
